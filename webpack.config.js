const path = require('path');

module.exports = {
  entry: './src/prosemirror-init.js',
  output: {
    filename: 'prosemirror-bundle.js',
    path: path.resolve(__dirname, 'wwwroot/js'),
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  }
};
