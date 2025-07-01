module.exports = {
  apps: [{
    name: 'server',
    script: './server.js',
    instances: 'max',        // Or a specific number: 4, 8 etc
    exec_mode: 'cluster',
    watch: false,            // Turn on if you want auto-restart on file change (not for prod usually)
    max_memory_restart: '500M',  // Optional: auto-restart if memory exceeds 500MB
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    }
  }]
};
