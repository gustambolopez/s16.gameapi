// the shittiest game api frfr 
import express from 'express';
import fetch from 'node-fetch';
import { hostname } from 'os';

const app = express();
const port = process.env.PORT || 8080;

const cachesearch = new Map();
const cacheduration = 6 * 60 * 1000;
// if you want to use it contact me on my discord
//       _   __   _ _ _
// ___/ |/ /_   __| (_) |__
// / __| | '_ \ / _` | | '_
// \__ \ | (_) | (_| | | |/
// |___/_|\___/ \__,_|_|_| |_|


app.use(express.json());

import { api_graphql, link_base, linksuffix, Image } from './value.js';


const image_suffix = "-512x512";
const image_suffixtwo = "-512x384"; 

// ts is so only the imgs that actually work show up on the json (this can slow a little bit response times but i fixed it with cache stuff)
async function checkstatus(url) {
    try {
        const res = await fetch(url, { method: 'HEAD', timeout: 5000 });
        return res.ok ? url : null;
    } catch (err) {
        console.error(`Error in the image ${url}:`, err.message);
        return null;
    }
}

// so basically ts just makes it so it delivers only one result (prioritizing the 512x512 format cuz is better)
async function theresultlmao(result) {
    const id = result.id;
    const link = `${link_base}${id}${linksuffix}`;

    const firstsuffix = image_suffix;
    const twosuffix = image_suffixtwo;

    const possibleImageUrls = [
        `${Image}${id}${firstsuffix}.jpg`,
        `${Image}${id}${firstsuffix}.jpeg`,
        `${Image}${id}${firstsuffix}.png`,
        `${Image}${id}${firstsuffix}.webp`,
        `${Image}${id}${twosuffix}.jpg`,
        `${Image}${id}${twosuffix}.jpeg`,
        `${Image}${id}${twosuffix}.png`,
        `${Image}${id}${twosuffix}.webp`
    ];

    let theimageurl = null;

    for (const url of possibleImageUrls) {
        const found = await checkstatus(url);
        if (found) {
            theimageurl = found;
            break;
        }
    }

    const { id: _, ...exclude } = result;
    const thefinalresult = {
        ...exclude,
        link
    };

    if (theimageurl) {
        thefinalresult.img = theimageurl;
    }

    return thefinalresult;
}

// paths and the initial result from graphql that then is transformed
app.get('/v0/api/games/q=:searchTerm', async (req, res) => {
    const term = req.params.searchTerm;
    const quantity = parseInt(req.query.quantity) || 21000;
    const sortByTitle = req.query.sortBytitle !== undefined;

    const cacheKey = `${term}-${quantity}-${sortByTitle}`;

    // search for cache first before loading so its faster
    if (cachesearch.has(cacheKey)) {
        const cachedData = cachesearch.get(cacheKey); 
        if (Date.now() - cachedData.timestamp < cacheduration) {
            console.log('loading from cache:', cacheKey);
            return res.json(cachedData.results);
        } else {
            cachesearch.delete(cacheKey);
        }
    }

    // copy pasted graphql queries from game db
    const query = `
        query GetSearchResults {
            results(search: "${term}", limit: ${quantity}, offset: 0) {
                title
                id
                description
            }
        }
    `;

    try {
        const resp = await fetch(api_graphql, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        if (!resp.ok) {
            const errText = await resp.text();
            console.error(`GraphQL error ${resp.status}: ${errText}`);
            return res.status(resp.status).json({ error: `Fetch failed: ${errText}` });
        }

        const data = await resp.json();

        if (data.errors) {
            console.error('GraphQL returned errors:', data.errors);
            return res.status(500).json({ error: 'GraphQL errors', details: data.errors });
        }

        const results = Array.isArray(data?.data?.results)
            ? await Promise.all(data.data.results.map(result => theresultlmao(result)))
            : [];

        if (results.length === 0) {
            return res.status(404).json({ error: 'No games found for that search term try searching another one maybe' });
        }

        // in this ubdate i added this flag so it sorts like a b c or d if the shi has ?sortbytitle or &sortbytitle (when there are other flags on the thingy )
        if (sortByTitle) {
            results.sort((a, b) => a.title.localeCompare(b.title));
        }

        // implemented cache for faster loading when user repeats a query
        cachesearch.set(cacheKey, { 
            results,
            timestamp: Date.now()
        });

        console.log('Stored cache:', cacheKey);
        res.json(results);

    } catch (err) {
        console.error('Fetch error:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// retarded idea frfr (standalone id search)
app.get('/v0/api/games/:id', async (req, res) => {
    const gameId = req.params.id;

    const query = `
        query {
            results(search: "${gameId}", limit: 1, offset: 0) {
                title
                id
                description
            }
        }
    `;

    try {
        const resp = await fetch(api_graphql, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ query })
        });
    // some erorr or sucess mesasages
        if (!resp.ok) {
            const errText = await resp.text();
            console.error(`GraphQL error ${resp.status}: ${errText}`);
            return res.status(resp.status).json({ error: `Fetch failed: ${errText}` });
        }

        const data = await resp.json();

        if (data.errors) {
            console.error('GraphQL returned errors:', data.errors);
            return res.status(500).json({ error: 'GraphQL errors', details: data.errors });
        }

        const found = data?.data?.results?.find(g => g.id === gameId);
        const gameResult = found ? await theresultlmao(found) : null;

        if (gameResult) {
            res.json([gameResult]);
        } else {
            res.status(404).json({ error: 'Game not found, is the ID correct or does it exist?' });
        }

    } catch (err) {
        console.error('Fetch error:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// idefk atp lmao
const DEV_MESSAGE = process.env.DEV_MESSAGE || '(Hosted on heaven previously altera, go check it here "https://discord.gg/qk4HmXf8tz"). to search something try /v0/api/games/q=(yoursearch)';

app.get('/', (req, res) => {
    res.send(DEV_MESSAGE);
});

let server;

function shutdown() {
    console.log("SIGTERM signal received: closing HTTP server");
    server.close(() => {
        console.log("https server closed.");
        process.exit(0);
    });
}

// graceful shutdown
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server = app.listen(port, () => {
    const address = server.address();
    console.log("Listening on:");
    console.log(`\thttp://localhost:${address.port}`);
    console.log(`\thttp://${hostname()}:${address.port}`);
    console.log(
        `\thttp://${
            address.family === "IPv6" ? `[${address.address}]` : address.address
        }:${address.port}`
    );
});