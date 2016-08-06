var config = require('./config');
var express = require('express');
var app = express();
var cors = require('cors');
var request = require('request');
var crypto = require('crypto');
var bodyParser = require('body-parser');
var jwt = require('jsonwebtoken');
var port = 7211;
app.set('superSecret', config.secret);
app.set('database', config.database);
app.set('dbSecret', config.dbSecret);
app.set('mail', config.mail);
app.set('mailgunSecret', config.mailgunSecret);
app.set('mailgunDomain', config.mailgunDomain);
app.set('mailgunPrivateSecret', config.mailgunPrivateSecret);
var nano = require('nano')('http://' + app.get('database') + ':' + app.get('dbSecret') + '@localhost:5984');
var vidplatformuser = nano.db.use('vidplatformusers');
var mailgun = require('mailgun-js')({ apiKey: app.get('mailgunPrivateSecret'), domain: app.get('mailgunDomain') });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/', function (req, res) {
    res.send('Hello user!');
});

function makePass() {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 6; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

app.listen(port);
console.log('Connected at http://localhost:' + port);
app.use(cors());


var apiRoutes = express.Router();

apiRoutes.get('/users', function (req, res) {
    vidplatformuser.list({ include_docs: true }, function (err, response) {
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
    var options = {
        url: 'https://api.mailgun.net/v2/address/validate'
        , method: 'GET'
        , qs: { address: req.body.username }
        , encoding: 'ASCII'
        , auth: {
            username: "api"
            , password: app.get("mailgunSecret")
        }
    }
    request(options, function (err, result) {
        if (JSON.parse(result.body).is_valid) {
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
            res.send({ status: 404 })
        }

    });
});

apiRoutes.post('/forgotPassword', function (req, res) {
    var testUsername = false;
    vidplatformuser.list({ include_docs: true }, function (err, response) {
        if (response && response.rows)
            (response.rows).forEach(function (element) {
                if (element.doc.username === req.body.email) {
                    var data = {
                        from: '<support@adcha.com>',
                        to: element.doc.username,
                        subject: 'AdCha Reset Password',
                        text: 'Link password click! If this email was not sent by you please ignore it.  ' + "http://localhost:7211/api/resetPass?email=" + element.doc.username
                    };

                    mailgun.messages().send(data, function (error, body) {
                        console.log(body);
                    });
                    testUsername = true;
                }
            }, this);
        if (!testUsername)
            res.send({ status: 404 });
    });
})

apiRoutes.get('/resetPass', function (req, res) {
    vidplatformuser.list({ include_docs: true }, function (err, response) {
        if (response && response.rows)
            (response.rows).forEach(function (element) {
                if (element.doc.username === req.query.email) {
                    var nonHashPass = makePass();
                    element.doc.password = crypto.createHash('md5').update(nonHashPass).digest('hex');
                    vidplatformuser.insert(element.doc, element.id, function (err, body) {
                        if (!err)
                            console.log(body)
                        var data = {
                            from: '<support@adcha.com>',
                            to: element.doc.username,
                            subject: 'AdCha Reset Password',
                            text: 'Your password has been reset. The temporary password is: ' + nonHashPass  + ' . Note that this password is temporary. Please change it as soon as possible.'
                        };

                        mailgun.messages().send(data, function (error, body) {
                            console.log(body);
                        });
                    });
                }
            }, this);
        res.redirect('http://localhost:8083');
    });
})

apiRoutes.post('/authenticate', function (req, res) {
    vidplatformuser.list({ include_docs: true }, function (err, response) {
        var foundUser = false;
        if (response && response.rows) {
            response.rows.forEach(function (element) {
                if (element.doc.username === req.body.username && element.doc.password === req.body.password) {
                    foundUser = element.doc;
                }
            }, this);
        }
        else {
            res.json({
                success: false,
                status: 503
            });
            return false;
        }
        if (foundUser) {
            var token = jwt.sign({ id: foundUser._id }, app.get('superSecret'), {
                expiresIn: 432000 //un token tine 5 zile. pe sign in poate ar merge resetat
            });

            res.json({
                success: true,
                token: token,
                id: foundUser._id
            });
        }
        else {
            res.json({
                success: false,
                status: 404
            });
        }
    });
});

apiRoutes.use(function (req, res, next) {

    var token = req.body.token || req.query.token || req.headers['x-access-token'];

    if (token) {

        jwt.verify(token, app.get('superSecret'), function (err, decoded) {
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
