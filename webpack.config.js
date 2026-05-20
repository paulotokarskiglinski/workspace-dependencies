const path = require('path');

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: 'none', // Leave minification to vsce
  target: 'node', // extensions run in a node context
  entry: {
    extension: './src/extension.ts' // the entry point of this extension
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, 'dist'),
    libraryTarget: 'commonjs'
  },
  resolve: {
    mainFields: ['module', 'main'],
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded
  },
  devtool: 'nosources-source-map'
};
