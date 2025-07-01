
module.exports = {
  apps: [{
    name: 'server',
    script: './server.js', // Replace with your script name
    instances: 'max', // Use all CPU cores, or specify a number (e.g., 4)
    exec_mode: 'cluster', // Use cluster mode
    env: {
      PORT: 5000, // All instances share port 5000
      NODE_ENV: 'production'
    }
  }]
};