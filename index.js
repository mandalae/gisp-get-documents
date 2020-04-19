const aws = require("aws-sdk");
const getLatestDocuments = require("./getLatestDocuments");

const docClient = new aws.DynamoDB.DocumentClient();

const loginHashCheck = (loginHash) => {
  const params = {
    TableName: "gps",
    ProjectionExpression: "email, hashExpires",
    FilterExpression: "#hs = :inputHashString",
    ExpressionAttributeNames: {
      "#hs": "hashString",
    },
    ExpressionAttributeValues: {
      ":inputHashString": loginHash,
    },
  };

  console.log(`Hash sent ${loginHash}`);

  return new Promise((resolve, reject) => {
    docClient.scan(params, async (err, res) => {
      if (!err) {
        const item = res.Items[0];
        resolve(item);
      } else {
        reject(err);
      }
    });
  });
};

// exports.handler = async (event) => {
//   if (event.httpMethod === "GET" && event.queryStringParameters.latest) {
//     return getLatestDocuments.handler(event);
//   } else {
//     return getDocumentsHandler(event);
//   }
// };

exports.handler = async (event) => {
  return new Promise(async (resolve, reject) => {
    let response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: "",
    };

    const done = (err, res) => {
      if (!err) {
        response.body = JSON.stringify(res);
        resolve(response);
      } else {
        response.body = err.message;
        response.statusCode = 400;
        reject(response);
      }
    };

    const s3 = new aws.S3({ apiVersion: "2006-03-01" });

    const bucketName = "gp-sharing-bucket";

    switch (event.httpMethod) {
      case "GET":
        const folderName = event.queryStringParameters.folderName;

        const credentialError = (err) => {
          response.body = err;
          response.statusCode = 401;
          reject(response);
        };

        const loginHash = event.queryStringParameters.hash;
        if (loginHash) {
          const userItem = await loginHashCheck(loginHash);
          if (!userItem) {
            credentialError("No credentials found for: " + loginHash);
          } else {
            console.log(`${userItem.email} has accessed folder: ${folderName}`);
          }
        } else {
          // credentialError('No login hash found');
        }

        if (folderName && folderName === "Online Resources") {
          var params = {
            TableName: "gisp-online-resources",
          };

          docClient.scan(params, (err, data) => {
            let items = [];
            if (data.Items) {
              items = data.Items;
            }
            console.log(err, items);
            done(null, items);
          });
        } else {
          let s3Params = {
            Bucket: bucketName,
            Delimiter: "/",
          };

          if (folderName.length > 0) {
            s3Params.Prefix = folderName.replace("_", " ") + "/";
          }

          console.log(params);

          const dynamoParams = {
            TableName: "gisp-online-resources",
            ProjectionExpression: "#folder, #url, title, lastUpdated",
            FilterExpression: "#folder = :folder",
            ExpressionAttributeNames: {
              "#folder": "folder",
              "#url": "url",
            },
            ExpressionAttributeValues: {
              ":folder": folderName,
            },
          };
          console.log(dynamoParams);
          docClient.scan(dynamoParams, (err, onlineResourcesData) => {
            let onlineResources = [];
            if (onlineResourcesData && onlineResourcesData.Items) {
              onlineResources = onlineResourcesData.Items;
            }
            console.log(err, onlineResources);

            s3.listObjects(s3Params, function (err, s3Data) {
              console.log(s3Data);
              let s3Items = s3Data.Contents;
              const itemsAndResources = s3Items.concat(onlineResources);
              console.log(itemsAndResources);
              done(err, itemsAndResources);
            });
          });
        }
        break;
      default:
        done(new Error(`Unsupported method "${event.httpMethod}"`));
    }
  });
};
