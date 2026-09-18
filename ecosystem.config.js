module.exports = {
  apps: [
    {
      name: "api-backend",
      script: "./server.js",
      env: {
        PORT: 3000
      }
    },
    {
      name: "web-frontend",
      script: "npm",
      args: "run dev",
      cwd: "./engine",
      watch: true,
      ignore_watch: ["node_modules", ".next", "dist"],
      env: {
        PORT: 5173
      }
    }
  ]
};