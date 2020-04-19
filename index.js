const aws = require("aws-sdk");

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

function getDocumentsHandler(event) {
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
}

function getAllLinksFromDynamoDB() {
  return new Promise((resolve, reject) => {
    const docClient = new aws.DynamoDB.DocumentClient();

    docClient.scan(
      {
        TableName: "gisp-online-resources",
      },
      (err, data) => {
        if (err) return reject(err);

        const links = data.Items || [];
        resolve(links);
      }
    );
  });
}

function getAllDocumentsFromS3() {
  return new Promise((resolve, reject) => {
    const s3 = new aws.S3({ apiVersion: "2006-03-01" });

    s3.listObjects(
      {
        Bucket: "gp-sharing-bucket",
        Delimiter: "/",
      },
      function (err, data) {
        if (err) return reject(err);

        const documents = data.Contents || [];
        resolve(documents);
      }
    );
  });
}

function getLatestDocumentsHandler(event) {
  return new Promise(async (resolve, reject) => {
    const done = (err, res) => {
      const response = {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: "",
      };

      if (!err) {
        response.body = JSON.stringify(res);
        resolve(response);
      } else {
        response.body = err.message;
        response.statusCode = 400;
        reject(response);
      }
    };

    switch (event.httpMethod) {
      case "GET":
        const limit = event.queryStringParameters.limit;

        try {
          const links = await getAllLinksFromDynamoDB();
          console.log("Successfully fetched links");

          const documents = await getAllDocumentsFromS3();
          console.log("Successfully fetched documents");

          const allResources = links.concat(documents);
          const allResourcesSorted = allResources.sort((a, b) => {
            const aDate = new Date(a.LastModified || a.lastUpdated);
            const bDate = new Date(b.LastModified || b.lastUpdated);
            return bDate.getTime() - aDate.getTime();
          });
          if (!limit) {
            console.log(
              "Limit is not passed, returning all resources sorted by date"
            );
            done(null, allResourcesSorted);
          } else {
            console.log(`Limit is passed, returning ${limit} latest resources`);
            const latestResources = allResourcesSorted.slice(0, limit);
            done(null, latestResources);
          }
        } catch (err) {
          console.log("Unable to get latest resources", err);
          done(err);
        }

        break;
      default:
        done(new Error(`Unsupported method "${event.httpMethod}"`));
    }
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "GET" && event.queryStringParameters.latest) {
    return getLatestDocumentsHandler(event);
  } else {
    return getDocumentsHandler(event);
  }
};
