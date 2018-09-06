// Server and Mongoose Models
import express from 'express';
import mongoose from 'mongoose';
import restify from 'express-restify-mongoose';
import { User, Artwork } from '../models/models.js';

// Wikipedia Parsing
import getWikiInfo from '../helpers/wikiparse.js';

// Google Maps Geocoding API
import axios from 'axios';
import accents from 'remove-accents';

// Router & Routes
const router = express.Router();

// Checks that User is Logged In Before Accessing Other Routes
// router.use('/', (req, res, next) => {
//   if (req.user) {
//     next();
//   } else {
//     res.status(404).send('No user logged in.');
//   }
// });

// RESTIFY API for Accessing Artworks
restify.serve(router, Artwork);

// GET route to get current user information
router.get('/user', (req, res, next) => {
  res.json({ success: true, user: req.user });
});

// POST route for Users to add new Artworks
router.post('/artwork', (req, res, next) => {
  // axios.get("https://en.wikipedia.org/w/api.php?format=json&action=query&list=search&srlimit=5&srsearch=Lisa+del+Giocondo")
  // .then((resp) => console.log(resp.data));
  if (!req.body.artworkName) {
    return res.status(404).send('No Artwork Name Provided.');
  } else {
    const getArtworkInfo = (index = 0) => {
      return new Promise((resolve, reject) => {
        let artworkInfoOutter = null;
        getWikiInfo(req.body.artworkName[index])
        .then((info) => {
          artworkInfoOutter = { ...info, dateViewed: new Date() };
          if(info.museum && info.city) {
            const baseURL = 'https://maps.googleapis.com/maps/api/geocode/json?address=';
            const geocodeURL = `${baseURL}${accents.remove(info.museum).split(" ").join("+")}+` +
                               `${accents.remove(info.city).split(" ").join("+")}&key=${process.env.GOOGLE_MAPS_GEOCODE_API_KEY}`;
            return axios.get(geocodeURL);
          }
          else {
            return Promise.resolve({ lat: 'Not Available', lng: 'Not Available' });
          }
        })
        .then((resp) => {
          if(resp.data) { resp = resp.data.results[0].geometry.location }
          const { lat, lng } = resp;
          artworkInfoOutter = { ...artworkInfoOutter, lat: lat, lng: lng };
          return Artwork.findOrCreate({ title: artworkInfoOutter.title });
        })
        .then(({ doc }) => {
          return Object.assign(doc, artworkInfoOutter).save();
        })
        .then((artwork) => {
          //req.user.userCollection.push(artwork._id);
          //req.user.save();
          return resolve(artwork);
        })
        .catch(err => {
          return reject(err);
        });
      })
      .then((artwork) => res.json({ success: true, artworkInfo: artwork }))
      .catch((err) =>{
        console.log(err);
        if(index === req.body.artworkName.length-1) {
          res.status(404).json({ success: false, error: err, msg: 'Could not find artwork.' });
        } else {
          getArtworkInfo(++index);
        }
      });
    };
    getArtworkInfo();
  }
});

// GET route for list of museums for a user's collection
router.get('/museums', (req, res, next) => {
  const test_id = "5b8979eeb50da80b3c119cae";
  // req.user._id
  User.findById(test_id)
  .populate('userCollection', 'museum city lat lng')
  .exec()
  .then(({ userCollection }) => res.json({ success: true, markers: userCollection }))
  .catch(err => res.status(404).json({ success: false, error: err }));
});

export default router;
