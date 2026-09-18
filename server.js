const multer = require('multer');
const express = require('express');
const path = require('path');
const { execFile } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const API_PASSWORD = process.env.API_PASSWORD || 'legacy@2010';

const requireAuth = (req, res, next) => {
  const authHeader = req.headers['x-api-password'];

  if (!authHeader || authHeader !== API_PASSWORD) {
    return res.status(401).json({ error: 'Accès non autorisé : mot de passe incorrect ou absent.' });
  }

  next();
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = req.body.folder || '';
    const targetDir = path.join(__dirname, 'engine', 'public', 'game', subDir);

    try {
      // Création du dossier s'il n'existe pas (recursive: true gère les sous-dossiers imbriqués)
      fs.mkdirSync(targetDir, { recursive: true });
      cb(null, targetDir);
    } catch (err) {
      cb(err, targetDir);
    }
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'engine', 'public', 'game')));

app.post('/api/generate', requireAuth, (req, res) => {
  const { prompt, sessionId, continueSession } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Le champ 'prompt' est requis." });
  }

  const systemInstruction =
    "[CONSIGNE STRICTE DE SÉCURITÉ : Tu as la permission d'analyser et lire tous les fichiers (notamment src/lib), " +
    "MAIS tu as l'interdiction STRICTE de créer, modifier ou supprimer des fichiers en dehors du dossier 'src/game/'. " +
    "Toutes tes modifications et créations de code DOIVENT se faire exclusivement dans 'src/game/'].\n\n";

  const rootDir = path.join(process.cwd(), 'engine/src');
  const fullPrompt = systemInstruction + prompt;
  const args = ['run', '--prompt', fullPrompt];

  if (sessionId) {
    args.push('--session-id', sessionId);
  }

  if (continueSession) {
    args.push('--continue');
  }

  execFile('auggie', args, { cwd: rootDir }, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr || error.message });
    }
    res.json({ result: "Code appliqué dans les fichiers avec succès !", log: stdout });
  });
});

app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier n'a été envoyé." });
  }

  const subDir = req.body.folder ? `${req.body.folder}/` : '';
  const fileUrl = `/game/${subDir}${req.file.filename}`;

  res.json({
    message: "Fichier téléversé avec succès !",
    file: {
      originalName: req.file.originalname,
      filename: req.file.filename,
      folder: req.body.folder || '/',
      path: fileUrl,
      size: req.file.size
    }
  });
});

app.get('/api/uploads', requireAuth, (req, res) => {
  const uploadDir = path.join(__dirname, 'engine', 'public', 'game');
  if (!fs.existsSync(uploadDir)) {
    return res.json({ files: [] });
  }

  try {
    const allFiles = getAllFilesRecursively(uploadDir, uploadDir);
    res.json({ files: allFiles });
  } catch (err) {
    res.status(500).json({ error: "Impossible de lire le dossier des fichiers téléversés." });
  }
});

app.get('/api/hello', (req, res) => {
  res.json({ message: "Bonjour depuis l'API !" });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré avec succès sur http://localhost:${PORT}`);
});

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function getAllFilesRecursively(dirPath, baseDir) {
  let fileList = [];

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      // Ignorer les fichiers et dossiers cachés (ex: .DS_Store, .gitkeep)
      if (item.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        fileList = fileList.concat(getAllFilesRecursively(fullPath, baseDir));
      } else if (item.isFile()) {
        const stats = fs.statSync(fullPath);
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

        fileList.push({
          filename: item.name,
          relativePath: relativePath,
          path: relativePath,
          size: stats ? stats.size : null,
          createdAt: stats ? stats.birthtime : null
        });
      }
    }
  } catch (err) {
    // Gestion des erreurs de lecture de sous-dossier si besoin
  }

  return fileList;
}