const express = require("express");
const router = express.Router();
const User = require('../models/User');
const Image = require('../models/Image');
const Review = require('../models/Review');
const bcrypt = require('bcryptjs');
const uploadCloud = require('../config/cloudinary.js');

router.get('/nearme/:longitude/:latitude/:radius?/:search?', (req, res, next) => {
  let radius = +req.params.radius;
  let lng = +req.params.longitude;
  let lat = +req.params.latitude;
  const query = req.params.search ? req.params.search : '';
  if(isNaN(radius)) radius = 100000; // 100km
  User.find({
    role:'Professional',
    location: {
      $near: {
        $maxDistance: radius,
        $geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
      }
    },
    $or: [
      {
        name: {
          $regex: new RegExp(query, 'im')
        }
      },
      {
        description: {
          $regex: new RegExp(query, 'im')
        }
      },
      {
        services: {
          $regex: new RegExp(query, 'im')
        }
      },
    ]
  })
  .select({
    email:0,
    password:0,
    lastSeen: 0,
    description: 0,
    services: 0,
    role: 0,
    phone: 0,
    createdAt: 0,
    updatedAt: 0,
    __v: 0,
    'location.type': 0,
    'reviews.images': 0,
  })
  .populate({path: 'reviews', select: 'stars -_id'})
  .then(users => {
    let response = users.map(user => {
      return {
        professional_id: user._id,
        name: user.name,
        image: user.userPhoto,
        avg_rate: user.reviews.reduce((acc, post) => acc + parseInt(post.stars),0) / user.reviews.length,
        location: {
          lng: user.location.coordinates[0],
          lat: user.location.coordinates[1]
        },
      };
    });

    res.status(200).json({
      users: response
    });
    return;
  })
  .catch(err => res.status(500).json({
    message: 'Error getting the users',
    error: err
  }));
});

router.get('/professional/:id', (req, res, next) => {
  User.findById(req.params.id)
    .select({
      'location.type':0,
      email:0,
      password:0,
      role:0,
      createdAt:0,
      updatedAt:0,
      __v:0
    })
    .populate({path: 'reviews', select: 'stars -_id'})
    .then(user => {
      if(!user){
        res.status(404).json({
          message: 'User not found',
        });
        return;
      }

      const response = {
        _id: user._id,
        name: user.name,
        avg_rate: user.reviews.reduce((acc, post) => acc + parseInt(post.stars),0) / user.reviews.length,
        image: user.userPhoto,
        description: user.description,
        services: user.services,
        lastSeen: user.lastSeen,
        location: {
          lng: user.location.coordinates[0],
          lat: user.location.coordinates[1]
        },
        phone: user.phone
      };

      res.status(200).json({
        user: response
      });
      return;
    })
    .catch(err => res.status(500).json({
      message: 'Error getting the specified user',
      error: err
    }));
});

router.get('/professional/:id/reviews', (req, res, next) => {
  User.findById(req.params.id)
    .select({
      location: 0,
      userPhoto: 0,
      email:0,
      password: 0,
      lastSeen: 0,
      description: 0,
      services: 0,
      role: 0,
      phone: 0,
      createdAt: 0,
      updatedAt: 0,
      __v: 0
    })
    .populate({
      path: 'reviews',
      select: 'images stars comment createdAt',
      populate: {
        path: 'fromUserId',
        select: 'name userPhoto'
      }
    })
    .then(user => {
      if(!user){
        res.status(404).json({
          message: 'User not found',
        });
        return;
      }

      const response = {
        _id: user._id,
        name: user.name,
        reviews: user.reviews
      };

      res.status(200).json({
        user: response
      });
      return;
    })
    .catch(err => res.status(500).json({
      message: 'Error getting the specified user',
      error: err
    }));
});

router.get('/:id', (req, res, next) => {
  User.findById(req.params.id)
    .populate({path: 'reviews', populate: {path: 'fromUserId', model: 'User'}})
    .then(user => {
      if(!user){
        res.status(404).json({
          message: 'User not found',
        });
        return;
      }
      res.status(200).json({
        user
      });
      return;
    })
    .catch(err => res.status(500).json({
      message: 'Error getting the specified user',
      error: err
    }));
});

router.put('/lastconnection/:id', (req, res, next) => {
  User.findByIdAndUpdate(req.params.id, {
    lastSeen: Date.now(),
  }, {new:true})
  .then(() => res.status(200).json({
    message: 'User\'s last connection updated',
  }))
  .catch(err => res.status(500).json({
    message: 'An error happened updating the user\'s last connection',
    error: err
  }));
});

router.put('/image/:id', uploadCloud.single('profileImage'), (req, res, next) => {
  let userPhoto = req.file.url;
  User.findByIdAndUpdate(req.params.id, {
    userPhoto
  }, { new: true })
    .then(user => {
      res.status(200).json({
        message: 'User updated sucessfully',
        user
      });
      return;
    })
    .catch(err => res.status(500).json({
      message: 'An error happened when uploading the image',
      error: err
    }));
});

router.put('/update/:id', (req, res, next) => {
  User.findById(req.params.id)
    .then(user => {
      // const salt = bcrypt.genSaltSync(10);
      // const hashPass = bcrypt.hashSync(req.body.password, salt);
      switch(user.role){
        case 'Client':
        const clientToUpdate = {
          name: req.body.name,
          email: req.body.email,
          // password: hashPass,
          lastSeen: Date.now(),
          // role: req.body.role,
          description: req.body.description
        }
        if(req.body.phone !== ''){
          clientToUpdate.phone = req.body.phone;
        }
          User.findByIdAndUpdate(user._id, clientToUpdate, {new: true})
          .then(user => {
            res.status(200).json({
              message: 'User updated sucessfully',
              user
            });
            return;
          })
          .catch(err => res.status(500).json({
            message: 'Error updating the user',
            error: err
          }));
        break;
        case 'Professional':
          const professionalToUpdate = {
            name: req.body.name,
            email: req.body.email,
            // password: req.body.password,
            lastSeen: Date.now(),
            description: req.body.description,
            services: req.body.services,
            // role: req.body.role,
            // "location.coordinates.0": +req.body.lng,
            // "location.coordinates.1": +req.body.lat
          }
          if(req.body.phone !== ''){
            professionalToUpdate.phone = req.body.phone;
          }
          User.findByIdAndUpdate(user.id, professionalToUpdate, {new: true})
          .then(user => {
            res.status(200).json({
              message: 'User updated sucessfully',
              user
            });
            return;
          })
          .catch(err => res.status(500).json({
            message: 'Error updating the user',
            error: err
          }));
        break;
      }
    })
    .catch(err => res.status(500).json({
      message: 'Error updating the user',
      error: err
    }));
});

router.delete('/delete/:id', (req, res, next) => {
  User.deleteOne({_id: req.params.id})
    .then(user => {
      if(!user){
        res.status(404).json({
          message: 'User not found',
        });
        return;
      }
      res.status(200).json({
        message: 'User deleted successfully',
      });
      return;
    })
    .catch(err => res.status(500).json({
      message: 'Error removing the specified user',
      error: err
    }));
});



module.exports = router;