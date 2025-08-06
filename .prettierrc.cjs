const config = {
  tabWidth: 2,
  useTabs: false,
  printWidth: 100,
  singleQuote: true,
  semi: false,
  trailingComma: 'all',
  bracketSpacing: false,
  bracketSameLine: false,
  arrowParens: 'avoid',
  quoteProps: 'as-needed',
  proseWrap: 'preserve',
  requirePragma: false,
  insertPragma: false,
  plugins: [
    'prettier-plugin-organize-imports',
    'prettier-plugin-jsdoc',
    'prettier-plugin-packagejson',
  ],
}
module.exports = config
