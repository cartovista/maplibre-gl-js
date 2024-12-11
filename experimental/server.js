const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); // Import cors middleware

const app = express();
const port = 3000;

// Enable CORS for all origins
app.use(cors());

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'sight',
    password: 'Cartes37!',
    port: 5432,
});

app.get('/mvt/:layer/:z/:x/:y', async (req, res) => {
    const {layer, z, x, y } = req.params;

     // Validate and sanitize the layer name to avoid SQL injection
     const validLayer = layer;
     //console.log(validLayer);

     if (!validLayer) {
         return res.status(400).send('Invalid layer name');
     }

     // Parse z, x, and y to integers
     const zInt = parseInt(z, 10);
     const xInt = parseInt(x, 10);
     const yInt = parseInt(y, 10);

     // Validate that z, x, and y are valid integers
     if (isNaN(zInt) || isNaN(xInt) || isNaN(yInt)) {
         return res.status(400).send('Invalid z, x, or y parameter. Must be integers.');
     }

     // Further validate z, x, y range if needed (optional)
     if (zInt < 0 || xInt < 0 || yInt < 0) {
         return res.status(400).send('z, x, and y must be non-negative integers.');
     }

    try {
        const result = await pool.query(
            `
            WITH bounds AS (
                SELECT ST_TileEnvelope($1::integer, $2::integer, $3::integer) AS bbox
            ),
            mvt AS (
                SELECT ST_AsMVTGeom(
                    geom,
                    (SELECT bbox FROM bounds),
                    4096, 256, true
                ) AS geom, "id", "value"::DOUBLE PRECISION AS value
                FROM public."${validLayer}"
            )
            SELECT ST_AsMVT(mvt, '${validLayer}', 4096, 'geom') AS mvt
            FROM mvt;
            `,
            [zInt, xInt, yInt]
        );

        res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
        res.send(result.rows[0].mvt);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generating MVT');
    }
});

app.listen(port, () => {
    console.log(`MVT server running on http://localhost:${port}`);
});
