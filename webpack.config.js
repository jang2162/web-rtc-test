const path = require('path');
const glob = require('glob');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const pages = glob.sync('./src/pages/**/*.js').map(item => ({path: item, page: item.substring(12, item.length - 3).split('/')}));
module.exports = {
    // module: {
    //     loaders: [
    //         {
    //             test: /\.js$/,
    //             exclude: /node_modules/,
    //             loaders: ["babel-loader"],
    //         }
    //     ],
    // },
    mode: process.env.NODE_ENV || 'development',
    entry: pages.reduce((memo, file) => {
            memo[file.page.join('_')] = file.path
            return memo;
        }, {}),
    output: {
        path: path.resolve(__dirname, 'public'),
        filename: '[name].[hash].bundle.js'
    },
    plugins: [
        ...pages.map(page => new HtmlWebpackPlugin({
            filename: `${page.page.join('/')}.html`,
            chunks: [page.page.join('_')],
            template: `./src/template/${page.page.join('/')}.html`
        }))
        ,new CopyWebpackPlugin({patterns: [{ from: './src/assets', to: 'assets' }] })
    ]
};