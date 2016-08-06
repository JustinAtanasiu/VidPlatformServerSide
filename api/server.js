var config = require('./config');
var express = require('express');
var emailExistence = require('email-existence');
var app = express();
var cors = require('cors');
app.set('superSecret', config.secret); 
app.set('database', config.database);
app.set('dbSecret', config.dbSecret);
app.set('mail', config.mail); 
var nano = require('nano')('http://'+app.get('database') + ':' + app.get('dbSecret') + '@localhost:5984');
var bodyParser = require('body-parser');
var jwt = require('jsonwebtoken'); 

var vidplatformuser = nano.db.use('vidplatformusers');
var port = 7211;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/', function(req, res) {
    res.send('Hello user!');
});

app.listen(port);
console.log('Connected at http://localhost:' + port);
app.use(cors());


var apiRoutes = express.Router();

 apiRoutes.get('/users', function (req, res) {
     vidplatformuser.list({include_docs: true}, function (err, response) {
        res.send(response.rows);
     });
 });
 

apiRoutes.post('/signUp', function (req, res) { 
    var data = req.body;
    res.send('Added:' + data);
    vidplatformuser.insert(data, function (err, body) {
        if (!err) {
        }
        console.log('User saved successfully');
    });
}); 

apiRoutes.post('/checkUsers', function (req, res) {
    emailExistence.check(req.body.username, function (err, resp) {
         if(resp) {     
         var testUsername = false;
         vidplatformuser.list({ include_docs: true }, function (err, response) {
             if (response && response.rows)
                 (response.rows).forEach(function (element) {
                     if (element.doc.username === req.body.username) {
                         res.send({ status: 400 });
                         testUsername = true;
                     }
                 }, this);
             if (!testUsername)
                 res.send({ status: 200 });
         });
         } else {
             res.send({status: 404})
         }
         
    }); 
});

apiRoutes.post('/authenticate', function (req, res) { 
   vidplatformuser.list({include_docs: true}, function (err, response) {
       var foundUser = false;
       if (response && response.rows){
           response.rows.forEach(function (element) {
               if (element.doc.username === req.body.username && element.doc.password === req.body.password) {
                   foundUser = element.doc;
               }
           }, this);
       }
       else{
           res.json({
               success: false,
               status: 503
           });
           return false;
       }
       if (foundUser) {
           var token = jwt.sign({id: foundUser._id}, app.get('superSecret'), {
               expiresIn: 432000 //un token tine 5 zile. pe sign in poate ar merge resetat
           });

           res.json({
               success: true,
               token: token,
               id: foundUser._id
           });
       }
       else{
            res.json({
               success: false,
               status: 404
           });
       }
    });
}); 

apiRoutes.use(function(req, res, next) {
  
  var token = req.body.token || req.query.token || req.headers['x-access-token'];

  if (token) {

    jwt.verify(token, app.get('superSecret'), function(err, decoded) {      
      if (err) {
        return res.json({ success: false, message: 'Failed to authenticate token.', status: 402 });    
      } else {
        req.decoded = decoded;    
        next();
      }
    });

  } else {
    return res.status(403).send({ 
        success: false, 
        message: 'No token provided.' 
    });
    
  }
});


apiRoutes.get('/getVidUser/:id', function (req, res) { 
    var id = req.url.split("/")[2];
    vidplatformuser.get(id, function (err, body) {
        if (!err) {
        }
        if (body) {
            delete body.password;
            delete body.username;
        }
        res.send(body);
        console.log('User saved successfully');
    });
}); 

apiRoutes.post('/saveVidUser/:id', function (req, res) {
    var id = req.url.split("/")[2]; vidplatformuser.get(id, function (err, bodyTwo) {
        if (!err) {
        }
        req.body.password = bodyTwo.password;
        req.body.username = bodyTwo.username;
        vidplatformuser.insert(req.body, id, function (err, body) {
            if (!err)
                console.log(body)
        });
    });
    
});

app.use('/api', apiRoutes);
