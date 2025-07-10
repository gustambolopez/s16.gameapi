//the shittiest game api frfr
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv'; // i hope ts finally works

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

//      _   __      _ _ _
//  ___/ |/ /_    __| (_) |__
// / __| | '_ \ / _` | | '_
// \__ \ | (_) | (_| | | | |/
// |___/_|\___/ \__,_|_|_|_| |_|

app.use(express.json());
const API = process.env.API;
// some sigma addtions fr (those are envs bc i might get cooked if someone sees it )
const BASE = process.env.BASE;
const linksuffix = process.env.linksuffix;

const Image = process.env.Image;
const image_suffix = process.env.image_suffix;
const image_suffixtwo = process.env.image_suffixtwo;

// ts is so only the imgs that actually work show up on the json (this can slow a little bit response times)
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
    const link = `${BASE}${id}${linksuffix}`;

    const possibleImageUrls = [
        `${Image}${id}${image_suffix}.jpg`,
        `${Image}${id}${image_suffix}.jpeg`,
        `${Image}${id}${image_suffix}.png`,
        `${Image}${id}${image_suffix}.webp`,
        `${Image}${id}${image_suffixtwo}.jpg`,
        `${Image}${id}${image_suffixtwo}.jpeg`,
        `${Image}${id}${image_suffixtwo}.png`,
        `${Image}${id}${image_suffixtwo}.webp`
    ];

    let theimageurl = null;
    for (let url of possibleImageUrls) {
        const found = await checkstatus(url);
        if (found) {
            theimageurl = found;
            break;
        }
    }

    const thefinalresult = {
        ...result,
        link,
    };

    if (theimageurl) thefinalresult.img = theimageurl;

    return thefinalresult;
}

// paths and the initial result from graphql that then is transformed
app.get('/v0/api/games/q=:searchTerm', async (req, res) => {
    const term = req.params.searchTerm;
    const quantity = parseInt(req.query.quantity) || 21000;

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
        const resp = await fetch(API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
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

        const results = Array.isArray(data?.data?.results) ? await Promise.all(data.data.results.map(theresultlmao)) : [];

        if (results.length === 0) {
            return res.status(404).json({ error: 'No games found for that search term try searching another one maybe' });
        }

        res.json(results);

    } catch (err) {
        console.error('Fetch error:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// retarded idea frfr (standalone id search )
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
        const resp = await fetch(API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
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

        let gameResult = null;
        const found = data?.data?.results?.find(g => g.id === gameId);
        if (found) gameResult = await theresultlmao(found);

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

app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
});
