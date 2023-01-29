// Require necessary packages
const express = require('express');
const { json } = require('express');
const knex = require('knex');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const googleMapsClient = require('@google/maps').createClient({
    key: 'AIzaSyA9_5zGgPuRKmJuEsEtNbTUxayCtNuaLV4'
});
const jsPDF = require('jspdf');
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");
const path = require("path");
const request = require('request');




// Create express app
const app = express();
app.use(bodyParser.json({ extended: false }));
app.use(bodyParser.urlencoded({ extended: false }));

// Configure knex to connect to Postgres database
const knexConfig = {
  client: 'pg',
  connection: {
    host : 'dpg-cfajsg1gp3jsh6fh11dg-a.oregon-postgres.render.com',
    user : 'aipi',
    password : 'cIFVMKB9UQdfb86Ed2c0DVcPpGQ0zBR5',
    database : 'aipi_gdul',
    ssl: true
  }
};

// Initialize knex
const db = knex(knexConfig);

//auth

app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'No Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  const [username, password] = Buffer.from(token, 'base64').toString().split(':');

  db('credentials').where({ users: username }).first()
    .then(user => {
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      if (password !== user.password) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      req.users = user;
      next();
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ message: 'Error while authenticating' });
    });
});

// Create routes
app.get('/', (req, res) => {
  res.send('Welcome to the Postgres/Knex API!');
});

//googleapi
app.get('/users/geolocation', (req, res) => {
  // Fetch all users from the "users" table
  db.select('id', 'postal').from('users')
    .then(users => {
      // Initialize an array to store the user data
      const userData = [];

      // Iterate through each user
      users.forEach(user => {
        // Use the Google Maps API to fetch the latitude and longitude for the user's postal code
        googleMapsClient.geocode({ address: user.postal }, (err, response) => {
          if (!err) {
            // Extract the latitude and longitude from the API response
            const lat = response.json.results[0].geometry.location.lat;
            const lng = response.json.results[0].geometry.location.lng;

            // Add the user data to the array
            userData.push({
              id: user.id,
              postal: user.postal,
              lat,
              lng,
            });

            // If this is the last user, return the user data as a JSON response
            if (userData.length === users.length) {
              res.json(userData);
            }
          } else {
            console.log(err);
            res.status(500).json({ message: 'Error while fetching user geolocation' });
          }
        });
      });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ message: 'Error while fetching users' });
    });
});


// Create a route
app.get('/users', (req, res) => {
  db('users')
    .select('id', 'first_name')
    .then(users => {
      res.json(users);
    })
    .catch(err => {
      res.status(500).json({ error: 'Failed to retrieve users' });
    });
});

// Add new endpoint
app.get('/users/:id', (req, res) => {
  const { id } = req.params;
  db('users')
    .where({ id })
    .select('id', 'first_name')
    .then(user => {
      if (user.length) {
        res.json(user);
      } else {
        res.status(404).json({ message: 'User not found' });
      }
    })
    .catch(err => {
      res.status(500).json({ error: 'Failed to retrieve user' });
    });
});

// Create a route
app.post('/users', async (req, res) => {
  try {
    const { first_name, last_name, postal } = req.body;
    await db('users').insert({ first_name, last_name, postal });
    res.status(201).send({ message: 'User created successfully' });
  } catch (err) {
    res.status(500).send({ message: 'Error creating user', error: err });
  }
});

app.post('/create-user', (req, res) => {
  const { first_name, last_name } = req.body;
  // Generate a random username and password
  const username = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const password = Math.random().toString(36).substring(2, 15);
  // Hash the password
  const hashedPassword = bcrypt.hashSync(password, 10);

  // Insert the user into the credentials table
  db('credentials').insert({
    users: username,
    password: hashedPassword
  }).then(() => {
    res.json({
      message: 'User created successfully',
      username: username,
      password: password
    });
  }).catch(err => {
    console.log(err);
    res.status(500).json({
      message: 'Error creating user'
    });
  });
});


// app.post('/generate-pdf', (req, res) => {
//   // read the template file and replace the placeholders with the payload data
//   const filePath = path.join(__dirname, '..', 'Desktop', 'field.docx');
//   const template = fs.readFileSync(filePath, 'utf8');
//   const replacedTemplate = template.replace(/{{field_1}}/g, req.body.field_1)
//                                     .replace(/{{field_2}}/g, req.body.field_2);

//   // create a new file stream for the modified template
//   const newFilePath = path.join(__dirname, '..', 'Desktop', 'modified_template.docx');
//   fs.writeFileSync(newFilePath, replacedTemplate);

//   // convert the modified template to a PDF
//   docxConverter(newFilePath, `new_${Date.now()}.pdf`, function(error, result) {
//     if (error) {
//         console.log('Error: ' + error);
//     } else {
//         console.log('Result: ' + result);
//     }
//   });

//   res.status(200).json({message: 'PDF generated successfully'});
// });

//pdfnew

app.post('/generate-pdf', (req, res) => {
  const fields = Object.keys(req.body);
  const content = fs.readFileSync(
    path.resolve(__dirname, "tag_example.docx"),
    "binary"
);

const zip = new PizZip(content);

const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
});

// Render the document (Replace {first_name} by John, {last_name} by Doe, ...)
doc.render({
  ...fields.reduce((acc, field) => ({
    ...acc,
    [field]: req.body[field]
  }), {})
});

const buf = doc.getZip().generate({
    type: "nodebuffer",
    // compression: DEFLATE adds a compression step.
    // For a 50MB output document, expect 500ms additional CPU time
    compression: "DEFLATE",
});

// buf is a nodejs Buffer, you can either write it to a
// file or res.send it with express for example.
fs.writeFileSync(path.resolve(__dirname, "output.docx"), buf);
res.status(200).json({message: 'PDF generated successfully'});
});

//withrequest

app.post('/generate-pdf2', (req, res) => {
  const fields = Object.keys(req.body);
  const templateUrl = decodeURI(req.body.templateUrl);

  request.get({
    url: templateUrl,
    encoding: null
  }, (err, response, body) => {
    if (err) {
      res.status(500).json({ message: 'Error fetching template file' });
    } else {
      const zip = new PizZip(body);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      doc.render({
        ...fields.reduce((acc, field) => ({
          ...acc,
          [field]: req.body[field]
        }), {})
      });

      const buf = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });

      fs.writeFileSync(path.resolve(__dirname, "output.docx"), buf);
      res.setHeader('Content-Type', 'application/octet-stream');
res.setHeader('Content-Disposition', 'attachment; filename=output.docx');
res.status(200).json({ data: buf });
    }
  });
});




  
// Start the server
const port = 5003;
app.listen(port, () => console.log(`Server started on port ${port}`));