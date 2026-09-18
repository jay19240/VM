**Legacy** is a modern game engine inspired by classic techniques that made retro games legendary.  
Designed for developers and artists who want complete freedom and maximum control, Legacy engine combines physics, rendering, and proven graphical pipelines to create unique experiences.

Why Legacy engine stands out:  
- Walkmesh and Hitmesh for simple and arcade physics.   
- Legacy aesthetics techniques.   
- Total rendering freedom: no forced scene graph, raw draw calls for direct control over every piece of your scene.   

Who is it for ?   
- Indie developers creating retro or experimental games.   
- Students and enthusiasts learning the foundations of physics and rendering.   
- Artists and retro tech lovers seeking authentic visual effects.  
- Modders and makers exploring new gameplay and technical experiences.   

# Quick Start
Once the project is created, follow the instructions to install dependencies:
```bash
cd legacy-gpu
npm install
```
And start the dev server on browser:
```bash
npm run dev
```
Or start the dev server on desktop:
```bash
npm run dev:tauri
```

You should now have your Legacy engine project running!   
A homepage let you choose between your game screen and a set of examples.   
The game screen is located in src/game/main.js.   
The default scene of the game is located in public/scene.blend, open this file with the portable version
of Blender inside editor folder to navigate the scene.   

# Build
When you are ready to ship your app to production, run the following:
```bash
npm run build:game
```
This will create a production-ready build of your app in the project's ./dist directory.

# General highlights
- 👨‍🌾 **Examples:** +30 "real-life" samples
- 🧙 **Supports:** Browser and desktop with Tauri
- ✍ **Languages:** Typescript, WGSL
- 👩‍🎓 **Documentation:** Working on it
- 🧑‍🏫 **Contributions:** We welcome any help! Send me an email at aliyah.raijin (at) gmail (dot) com

# Features
- 👨‍💻 **2D Software Compatibility**
    - AseSprite compatible
    - EzSpriteSheet compatible
    - Tilekit compatible
    - SpriteFusion compatible
- ------------------------------------------------------------
- 👨‍💻 **3D Software Compatibility**
    - Blender compatible & real-time scene editing
- ------------------------------------------------------------
- 👾 **General**
    - Container Manager
    - Maths
    - Tweening
    - Events
    - Curves: Catmull-Rom
    - Quaternions
    - Object pooling
    - Physics primitives
    - Motion lines
- ------------------------------------------------------------
- 📐 **2D**
    - Sprite: Static, Animated
    - Tilemap: Isometric, Orthographic with tile animation
    - Tilemap Animation
    - Tilemap multi-layers and objects
    - Particles
    - Rendering filters
    - Bitmap font
- ------------------------------------------------------------
- 📐 **2D Physics**
    - BoundingRect
    - Arcade collision system with slopes support
    - Box2D built-in
- ------------------------------------------------------------
- 🧊 **3D General**
    - Debug renderer
    - Mesh renderer
    - Sprite renderer
    - Particles renderer
    - Skybox renderer
    - Sun renderer
    - Flares renderer
    - Post processing renderer
    - Shadow volume renderer
    - Multi-viewport
    - Camera: Isometric, Perspective, Clipping
    - Auto mip-map
    - Customizable shaders: Text insertions
    - Output multiple rendering attachments: Depth, Normal, Tag, Custom channel
- ------------------------------------------------------------
- 🧊 **3D Mesh**
    - Static & Animated mesh
    - OBJ loader
    - Billboarding
    - Fog
    - Vertex colorization
    - Decals
    - Shadow mapping
    - Normal smooth group
    - Directional light
    - Point lights: 64 lights
    - Spot lights: 16 lights
    - +16 custom params
    - +2 custom textures
- ------------------------------------------------------------
- 🧊 **3D Camera**
    - Orbit
    - WASD
- ------------------------------------------------------------
- 🧊 **3D Physics**
    - BoundingBox
    - BoundingCylinder
    - Walkmesh with BSP
    - Hitmesh with BSP
    - Ray-testing
    - Jolt built-in
- ------------------------------------------------------------
- 🧊 **3D Material**
    - Opacity
    - Texture albedo
    - Color blending
    - Light Phong reflection: Diffuse, Specular, Ambient, Emissive
    - Light Group
    - Shadow Mapping
    - Secondary texture albedo
    - Secondary texture blending mode: Mul or Mix
    - DuDv map: Multi-target
    - Normal map
    - Dissolve map
    - Diffuse map
    - Specular map
    - Emissive map
    - Normal map
    - Env map
    - Toon map
    - PSX Shader: Jitter vertex, Gouraud shading
    - Textures scroll: Multi-target
    - Flipbook UV: Multi-target
    - Decal group
    - Volumetric
    - Arcade custom shader effect: Experimental
    - +16 custom params
    - +2 custom textures
- ------------------------------------------------------------
- 🧊 **3D Post-processing**
    - Outline
    - Hardware dithering
    - Pixelation
    - Color depth limiting
    - Shadow volume
- ------------------------------------------------------------
- 🎮 **Input**
    - Action mapping
    - Gamepad, keyboard and mouse support
- ------------------------------------------------------------
- 🧠 **AI**
    - A* for 2D/3D with graph and grid
    - Djikstra graph
    - Min-max with alpha-beta pruning
- ------------------------------------------------------------
- 📺 **Screen**
    - Navigate between different view of your game
    - Resources pre-loading
- ------------------------------------------------------------
- 📜 **Scripts**
    - Load script from json file
    - Register async command function and call-it from json file
    - Manual jump to part of the script
    - Command primitives like: WAITPAD, GOTO, GOTO_IF, EXEC_IF, VAR_SET, VAR_ADD, VAR_SUB, DELAY
- ------------------------------------------------------------
- 🔊 **Sound**
    - Handle sounds by groups
    - Play multiple sounds at same time
- ------------------------------------------------------------
- 🌳 **Tree**
    - 2D binary space partition
    - 3D binary space partition
- ------------------------------------------------------------
- 🎨 **UI**
    - Focus/unfocus widgets
    - Fade in/out
    - Widget architecture
- ------------------------------------------------------------
- 🖍️ **UI Widgets**
    - Confetti
    - Dialog + choices
    - Dialog only
    - Print long text
    - Description list
    - Slider
    - Menu base
    - Menu list view
    - Menu text & sprites
    - Prompt
    - Sprite
    - Text
    - Input
    - Input keyboard
- ------------------------------------------------------------
- 🌆 **DNA**
    - ECS architecture implementation