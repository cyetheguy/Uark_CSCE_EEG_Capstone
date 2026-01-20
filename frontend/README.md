# Solid Pod Listener

Pod listener that can send numbers to a specified resource 

Edit the `.env` file to set resource to watch/overwrite by providing the Solid Community Server URL (Be sure not to inlude the ending '/' on, for example, your Amazon EC2 instance.)

You might have to click the advanced settings to have your browser accept the CSS before you can login for now


If you get: error when starting dev server: Error: EPERM: operation not permitted
Remove-Item -Recurse -Force "C:\Users\putte\GitHub\Solid-Pod-Writer\node_modules\.vite"
Then run: npm install

## Setup

1. `npm install`
2. `npm run dev` to run
