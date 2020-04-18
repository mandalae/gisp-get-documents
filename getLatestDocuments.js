const aws = require("aws-sdk");

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

exports.handler = getLatestDocumentsHandler;
