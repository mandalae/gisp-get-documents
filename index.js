const aws = require('aws-sdk');

const docClient = new aws.DynamoDB.DocumentClient();

const loginHashCheck = loginHash => {
    const params = {
        TableName: "gps",
        ProjectionExpression: "email, hashExpires",
        FilterExpression: "#hs = :inputHashString",
        ExpressionAttributeNames: {
            "#hs": "hashString",
        },
        ExpressionAttributeValues: {
             ":inputHashString": loginHash
        }
    };

    console.log(`Hash sent ${loginHash}`);

    return new Promise((resolve, reject) => {
        docClient.scan(params, async (err, res) => {
            if (!err){
                const item = res.Items[0];
                resolve(item);
            } else {
                reject(err);
            }
        });
    });
};

exports.handler = async (event) => {
    return new Promise(async (resolve, reject) => {
        let response = {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: ''
        };

        const done = (err, res) => {
            if (!err){
                response.body = JSON.stringify(res);
                resolve(response);
            } else {
                response.body = err.message;
                response.statusCode = 400;
                reject(response);
            }
        }

        const s3 = new aws.S3({apiVersion: '2006-03-01'});

        const bucketName = "gp-sharing-bucket";

        switch (event.httpMethod) {
            case 'GET':
                const folderName = event.queryStringParameters.folderName;

                const credentialError = (err) => {
                    response.body = err;
                    response.statusCode = 401;
                    reject(response);
                }

                const loginHash = event.queryStringParameters.hash;
                if (loginHash){
                    const userItem = await loginHashCheck(loginHash);
                    if (!userItem){
                        credentialError('No credentials found for: ' + loginHash);
                    } else {
                        console.log(`${userItem.email} has accessed folder: ${folderName}`);
                    }
                } else {
                    credentialError('No login hash found');
                }

                if (folderName && folderName === 'Online Resources'){
                    var params = {
                        TableName: "gisp-online-resources"
                    };

                    docClient.scan(params, (err, data) => {
                        let items = [];
                        if (data.Items){
                            items = data.Items;
                        }
                        console.log(err, items);
                        done(null, items);
                    });
                } else {
                    let params = {
                      Bucket: bucketName,
                      Delimiter: '/'
                    };

                    if (folderName.length > 0){
                        params.Prefix = folderName.replace('_', ' ') + '/';
                    }

                    console.log(params);

                    s3.listObjects(params, function(err, data) {
                        console.log(data);
                        let items = data.Contents;
                        if (folderName.length === 0) {
                            data.CommonPrefixes.forEach(item => {
                                items.push(item.Prefix);
                            });
                        }
                        done(err, items);
                    });
                }
                break;
            default:
                done(new Error(`Unsupported method "${event.httpMethod}"`));
        }
    });
}
