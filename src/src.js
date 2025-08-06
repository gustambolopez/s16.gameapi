import boxen from 'boxen'
import chalk from 'chalk'
import express from 'express'
import fetch from 'node-fetch'
import ora from 'ora'
import {hostname} from 'os'

import {api_graphql, Image, link_base, linksuffix} from './value.js'

const app = express()
const port = parseInt(process.env.PORT) || 8080

const cachesearch = new Map()
const cacheduration = 6 * 60 * 1000

app.use(express.json())

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
  next()
})

const image_suffix = '-512x512'
const image_suffixtwo = '-512x384'

async function checkstatus(url) {
  try {
    const res = await fetch(url, {method: 'HEAD', timeout: 5000})
    return res.ok ? url : null
  } catch (err) {
    console.error(`error in the image ${url}:`, err.message)
    return null
  }
}

async function theresultlmao(result) {
  const id = result.id
  const link = `${link_base}${id}${linksuffix}`

  const possibleImageUrls = [
    `${Image}${id}${image_suffix}.jpg`,
    `${Image}${id}${image_suffix}.jpeg`,
    `${Image}${id}${image_suffixtwo}.jpg`,
    `${Image}${id}${image_suffixtwo}.jpeg`,
  ]

  let theimageurl = null
  for (const url of possibleImageUrls) {
    theimageurl = await checkstatus(url)
    if (theimageurl) break
  }

  const {id: _, ...exclude} = result
  return {
    ...exclude,
    link,
    ...(theimageurl && {img: theimageurl}),
  }
}

app.get('/v0/api/games/q=:searchTerm', async (req, res) => {
  const term = req.params.searchTerm
  const quantity = parseInt(req.query.quantity) || 21000
  const sortByTitle = req.query.sortBytitle !== undefined

  const cacheKey = `${term}-${quantity}-${sortByTitle}`

  if (cachesearch.has(cacheKey)) {
    const cachedData = cachesearch.get(cacheKey)
    if (Date.now() - cachedData.timestamp < cacheduration) {
      console.log('loading from cache:', cacheKey)
      return res.json(cachedData.results)
    }
    cachesearch.delete(cacheKey)
  }

  const query = `
    query SearchGames {
      gamesSearched(input: { search: "${term}", hitsPerPage: ${quantity} }) {
        hits {
          objectID
          type
          title
          description
          instruction
          tags
          categories
          company
          mobile
          keyFeatures
          slugs { name active }
          publishedAt
          lastPublishedAt
          languages
        }
      }
    }
  `

  try {
    const resp = await fetch(api_graphql, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://gamedistribution.com',
        Referer: 'https://gamedistribution.com/',
      },
      body: JSON.stringify({query}),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error(`GraphQL error ${resp.status}: ${errText}`)
      return res.status(resp.status).json({error: `Fetch failed: ${errText}`})
    }

    const data = await resp.json()

    if (data.errors) {
      console.error('GraphQL returned errors:', data.errors)
      return res.status(500).json({error: 'GraphQL errors', details: data.errors})
    }

    const hits = data?.data?.gamesSearched?.hits ?? []
    const results = await Promise.all(
      hits.map(result =>
        theresultlmao({
          id: result.objectID,
          ...result,
          mobile: result.mobile?.map(m =>
            m === 'ForIOS' ? 'IOS' : m === 'ForAndroid' ? 'Android' : m,
          ),
        }),
      ),
    )

    if (results.length === 0) {
      return res.status(404).json({error: 'no games found.'})
    }

    if (sortByTitle) {
      results.sort((a, b) => a.title.localeCompare(b.title))
    }

    cachesearch.set(cacheKey, {results, timestamp: Date.now()})
    console.log('Stored cache:', cacheKey)
    res.json(results)
  } catch (err) {
    console.error('Fetch error:', err)
    res.status(500).json({error: 'Server error', details: err.message})
  }
})

app.get('/v0/api/games/:id', async (req, res) => {
  const gameId = req.params.id

  const query = `
    query SearchGames {
      gamesSearched(input: { search: "${gameId}", hitsPerPage: 1 }) {
        hits {
          objectID
          type
          title
          description
          instruction
          tags
          categories
          company
          mobile
          keyFeatures
          slugs { name active }
          publishedAt
          lastPublishedAt
          languages
        }
      }
    }
  `

  try {
    const resp = await fetch(api_graphql, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://gamedistribution.com',
        Referer: 'https://gamedistribution.com/',
      },
      body: JSON.stringify({query}),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error(`GraphQL error ${resp.status}: ${errText}`)
      return res.status(resp.status).json({error: `Fetch failed: ${errText}`})
    }

    const data = await resp.json()

    if (data.errors) {
      console.error('GraphQL returned errors:', data.errors)
      return res.status(500).json({error: 'GraphQL errors', details: data.errors})
    }

    const found = data?.data?.gamesSearched?.hits?.find(g => g.objectID === gameId)
    if (!found)
      return res.status(404).json({error: 'Game not found, is the ID correct or does it exist?'})

    const gameResult = await theresultlmao({
      id: found.objectID,
      ...found,
      mobile: found.mobile?.map(m => (m === 'ForIOS' ? 'IOS' : m === 'ForAndroid' ? 'Android' : m)),
    })

    res.json([gameResult])
  } catch (err) {
    console.error('Fetch error:', err)
    res.status(500).json({error: 'Server error', details: err.message})
  }
})

const DEV_MESSAGE =
  process.env.DEV_MESSAGE ||
  '(Hosted on heaven previously altera, go check it here "https://discord.gg/qk4HmXf8tz"). to search something try /v0/api/games/q=(yoursearch)'

app.get('/', (req, res) => {
  res.send(DEV_MESSAGE)
})

const spinner = ora('starting server...').start()

const server = app.listen(port, () => {
  spinner.succeed('server started')

  const info = `
${chalk.bold(
  chalk.hex('#059d4aff')(`

███████╗ ██╗ ██████╗     █████╗ ██████╗ ██╗
██╔════╝███║██╔════╝    ██╔══██╗██╔══██╗██║
███████╗╚██║███████╗    ███████║██████╔╝██║
╚════██║ ██║██╔═══██╗   ██╔══██║██╔═══╝ ██║
███████║ ██║╚██████╔╝██╗██║  ██║██║     ██║
╚══════╝ ╚═╝ ╚═════╝ ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝
                                           
`),
)}
  ${chalk.bold(chalk.hex('#1E90FF')('local host:'))} http://localhost${port === 80 ? '' : ':' + chalk.bold(port)}
  ${chalk.bold(chalk.hex('#1E90FF')('system hostname:'))} http://${hostname()}${port === 80 ? '' : ':' + chalk.bold(port)}
  ${chalk.bold(chalk.hex('#1E90FF')('direct ip:'))} http://127.0.0.1${port === 80 ? '' : ':' + chalk.bold(port)}
`

  console.log(
    boxen(info, {
      padding: 1,
      borderColor: 'green',
      borderStyle: 'round',
    }),
  )
})

function logWithTime(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function shutdown() {
  spinner.start('shutting down server...')
  logWithTime(chalk.yellow('SIGTERM signal received: closing HTTP server'))
  server.close(() => {
    logWithTime(chalk.green('server closed.'))
    spinner.succeed('server shutdown complete')
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

process.on('uncaughtException', err => {
  spinner.fail('Uncaught Exception!')
  console.error(
    boxen(chalk.red.bold('[UNCAUGHT EXCEPTION]'), {
      padding: 1,
      borderColor: 'red',
      borderStyle: 'round',
    }),
    err,
  )
  process.exit(1)
})

process.on('unhandledRejection', reason => {
  spinner.fail('Unhandled Rejection!')
  console.error(
    boxen(chalk.red.bold('[UNHANDLED REJECTION]'), {
      padding: 1,
      borderColor: 'red',
      borderStyle: 'round',
    }),
    reason,
  )
  process.exit(1)
})
