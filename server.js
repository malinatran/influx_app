// Requirements
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var md5 = require('md5');
var cookieParser = require('cookie-parser');
var express = require('express');
var handlebars = require('express-handlebars');
var moment = require('moment');
var connect = require('connect');
var methodOverride = require('method-override');
var http = require('http');
var aws = require('aws-sdk');

var app = express();

var router = express.Router();
var port = process.env.PORT || 3000;
var mongoURI = process.env.MONGOLAB_URI || 'mongodb://localhost/influx';

// Listener
app.engine('.hbs', handlebars({
  defaultLayout: 'single',
  extname: '.hbs'
}));
app.set('view engine', '.hbs');
app.listen(port);

// Models
var User = require('./models/User.js');
var Story = require('./models/Story.js');

// Middleware
app.use(methodOverride('_method'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(cookieParser());

// AWS Env Variables
var AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
var AWS_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
var S3_BUCKET = process.env.S3_BUCKET_NAME;

// Database
mongoose.connect(mongoURI);

// ================================================
// 0. Load user's stories
// ================================================
app.get('/', function(req, res) {
  var user_id = req.cookies.loggedInId;
  Story.find({ user: user_id }).sort('-date').exec(function(err, stories) {
    res.render('index', {
      stories: stories,
      isUserLoggedIn: (typeof req.cookies.loggedInId !== 'undefined')
    });
  });
});

// ================================================
// 1. Signup new user
// ================================================
app.post('/users', function(req, res) {
  var password_hash = md5(req.body.password);
  var user = new User({
    username: req.body.username,
    password_hash: password_hash
  });
  user.save(function(err) {
    if (err) {
      console.log(err);
      res.redirect('/');
    } else {
      console.log('User is created.');
      res.cookie('loggedInId', user.id, { maxAge:31556952000 });
      res.redirect('/');
    }
  });
});

// ================================================
// 2. Login returning user
// ================================================
app.post('/login', function(req, res) {
  User.findOne({
    username: req.body.username,
    password_hash: md5(req.body.password)
  }, function(err, user) {
    if (!user) {
      console.log(err);
      res.redirect('/');
    } else {
      console.log('User is logged in.');
      res.cookie('loggedInId', user.id);
      res.redirect('/');
    };
  });
});

// ================================================
// 3. Logout user
// ================================================
app.get('/logout', function(req, res) {
  res.clearCookie('loggedInId');
  res.redirect('/');
});

// ================================================
// 4. Create new story
// ================================================
app.post('/stories', function(req, res) {
  date = moment(req.body.updated_at).format("MMM Do, YYYY");
  var story = new Story({
    date: date,
    location: req.body.location,
    prompt: req.body.prompt, 
    anecdote: req.body.anecdote,
    image: req.body.image,
    user: req.cookies.loggedInId
  });
  story.save(function(err) {
    if (err) {
      console.log(err);
    } else {
      console.log('Story is created.');
      res.redirect('/');
    }
  });
});

// ================================================
// 5. Get individual story
// ================================================
app.get('/stories', function(req, res) {
  Story.findById({ _id: req.body.id }, {
    date: date,
    location: req.body.location,
    prompt: req.body.prompt, 
    anecdote: req.body.anecdote,
    image: req.body.image,
    user: req.cookies.loggedInId
  }, function(err, story) {
    if (err) {
      console.log(err);
    } else {
      res.send(story);
    }
  });
});

// ================================================
// 6. Edit individual story
// ================================================
app.put('/stories/:id', function(req, res) {
  date = moment(req.body.updated_at).format("MMM Do, YYYY");
  Story.findOneAndUpdate({ _id: req.params.id }, {
    date: date,
    location: req.body.location,
    prompt: req.body.prompt, 
    anecdote: req.body.anecdote,
    image: req.body.image,
    user: req.cookies.loggedInId
  }, function(err, story) {
    if (err) {
      console.log(err);
    } else {
      res.redirect('/');
    }
  });
});

// ================================================
// 7. Delete story
// ================================================
app.delete('/stories/:id', function(req, res) {
  Story.findByIdAndRemove(req.params.id).exec(function(err, story) {
    if (err) {
      res.statusCode = 404;
    } else {
      res.redirect('/');
    }
  });
});

// ================================================
// 8. Delete story
// ================================================
app.get('/sign_s3', function(req, res) {
  aws.config.update({
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_KEY
  });
  var s3 = new aws.S3();
  var s3_params = {
    Bucket: S3_BUCKET,
    Key: req.query.file_name,
    Expires: 60,
    ContentType: req.query.file_type,
    ACL: 'public-read'
  };
  s3.getSignedUrl('putObject', s3_params, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      var file_name = req.cookies.loggedInId + '_' + new Date().getTime() + '_' + req.query.file_name;
      var return_data = {
        signed_request: data,
        url: 'https://'+S3_BUCKET+'.s3.amazonaws.com/'+file_name
      };
      res.send(return_data);
    }
  });
});
