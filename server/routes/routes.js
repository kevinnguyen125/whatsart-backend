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
router.use('/', (req, res, next) => {
  if (req.user) {
    next();
  } else {
    res.statusMessage = 'No user logged in.';
    res.status(404).end();
  }
});

// RESTIFY API for Accessing Artworks
restify.serve(router, Artwork);

// GET route to get current User information without their Collection or Favorites
router.get('/user', (req, res, next) => {
  res.json({ success: true, user: req.user });
});

// POST route for Users to add new Artworks
router.post('/artwork', (req, res, next) => {
  console.log('Queries:', req.body.artworkName);
  if (!req.body.artworkName || req.body.artworkName.constructor !== Array || req.body.artworkName.length === 0) {
    return res.status(404).send('No Artwork Name Provided.');
  } else {
    const getArtworkInfoOutter = (outterIndex = 0) => {
      return new Promise((outterResolve, outterReject) => {
        if (!req.body.artworkName[outterIndex]) { throw "Undefined object"; }
        const searchQuery = req.body.artworkName[outterIndex].split(" ").join("+");
        axios.get(`https://en.wikipedia.org/w/api.php?format=json&action=query&list=search&srlimit=3&srsearch=${searchQuery}`)
        .then((resp) => {
          const possibleWikiPages = resp.data.query.search.map((obj)=>obj.title);
          const getArtworkInfoInner = (innerIndex = 0) => {
            return new Promise((innerResolve, innerReject) => {
              let artworkInfoStored = null;
              getWikiInfo(possibleWikiPages[innerIndex])
              .then((info) => {
                artworkInfoStored = { ...info, dateViewed: new Date() };
                if (info.museum && info.city) {
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
                if (resp.data) { resp = resp.data.results[0].geometry.location }
                const { lat, lng } = resp;
                artworkInfoStored = { ...artworkInfoStored, lat: lat, lng: lng };
                return Artwork.findOrCreate({ title: artworkInfoStored.title });
              })
              .then(({ doc }) => {
                return Object.assign(doc, artworkInfoStored).save();
              })
              .then((artwork) => {
                return innerResolve(artwork);
              })
              .catch(err => {
                return innerReject(err);
              });
            })
            .then((artwork) => Promise.resolve(artwork))
            .catch((err) => {
              if(innerIndex === possibleWikiPages.length-1) {
                // console.log(err);
                return Promise.reject(err);
              } else {
                return getArtworkInfoInner(++innerIndex);
              }
            });
          };
          return getArtworkInfoInner();
        })
        .then((artwork) => outterResolve(artwork))
        .catch((err) => outterReject(err));
      })
      .then((artwork) => {
        if (!req.user.userCollection.some((user) => user.equals(artwork._id))){ req.user.userCollection.push(artwork._id); }
        req.user.save()
        .then((user) => res.json({ success: true, artworkInfo: artwork }));
      })
      .catch((err) =>{
        // console.log(err);
        if (outterIndex === req.body.artworkName.length-1) {
          res.status(404).json({ success: false, error: err, msg: 'Could not find artwork.' });
        } else {
          getArtworkInfoOutter(++outterIndex);
        }
      });
    };
    getArtworkInfoOutter();
  }
});

// GET route for getting museums from a user's artwork collection
router.get('/museums', (req, res, next) => {
  User.findById(req.user._id)
  .populate('userCollection', 'title museum city lat lng imgURL')
  .exec()
  .then(({ userCollection }) => res.json({ success: true, markers: userCollection }))
  .catch(err => res.status(404).json({ success: false, error: err }));
});

// GET route for getting User information AND collection populated
router.get('/UserWithCollection', (req, res, next) => {
  User.findById(req.user._id)
  .populate('userCollection')
  .exec()
  .then((user) => res.json({ success: true, user }))
  .catch(err => res.status(404).json({ success: false, error: err }));
});

export default router;
