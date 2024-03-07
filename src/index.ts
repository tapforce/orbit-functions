const functions = require("firebase-functions");
const nodeFetch = require("node-fetch");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const admin = require("firebase-admin");
const fs = require("fs");
const { JSDOM } = require("jsdom");
const postmark = require("postmark");
const app = express();
const port = 3000;
const path = require("path");
const puppeteerCore = require("puppeteer-core"); // Used for typing, not direct invocation
const chromeAwsLambda = require("chrome-aws-lambda");
const ejs = require("ejs");

admin.initializeApp();


exports.sendEmailToUsers = functions.https.onRequest(async (request:any, response:any) => {
  try {
    await getDataForAllUsers();
    // Once all processing is done, send a response back.
    response.send({ success: true, message: "Emails processing completed." });
  } catch (error) {
    console.error("Error in sendEmailToUsers:", error);
    response.status(500).send({ success: false, message: "Error processing emails." });
  }
  async function getDataForAllUsers() {
    const db = admin.firestore();
    const usersRef = db.collection('Users');
    const querySnapshot = await usersRef.where('email', '==', 'kytziabourlonb@gmail.com').get();
  
    if (querySnapshot.empty) {
      console.log('No matching documents.');
      return [];
    }
  
  
    for (const userDoc of querySnapshot.docs) {
      const userData = userDoc.data();
      const userName = userData.name || 'User';
      const userEmail = userData.email;
  
      const periodsCollection: any = {
        weekly: [],
        monthly: [],
        quarterly: [],
        annually: [],
        userName: userName,
        userEmail: userEmail,
        appLink: "https://",
      };
  
      const personsRef = userDoc.ref.collection('Persons');
      const snapshot = await personsRef.get();
  
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const period = data.period;
        if (!periodsCollection[period]) continue;
      
        let imageLink;
        if (data.imageData) {
          const buffer = Buffer.from(data.imageData, 'binary');
          imageLink = `data:image/png;base64,${buffer.toString('base64')}`;
        } else {
          // Generate a URL using the UI Avatars API as before
          imageLink = `https://ui-avatars.com/api/?rounded=true&name=${encodeURIComponent(data.firstName ? data.firstName : data.lastName + ' ' + data.lastName ? data.lastName : data.firstName)}&size=64&background=e0e0e0&bold=true??color=020302`;
        }
      
        periodsCollection[period].push({
          ...data,
          imageLink,
          sortKey: data.checkins?.createdAt || 0
        });
      }
  
      Object.keys(periodsCollection).forEach(period => {
        if (['weekly', 'monthly', 'quarterly', 'annually'].includes(period)) {
          periodsCollection[period] = periodsCollection[period]
            .sort((a: any, b: any) => a.sortKey === 0 ? -1 : b.sortKey === 0 ? 1 : a.sortKey - b.sortKey)
            .slice(0, 5)
            .map((item: any) => item.imageLink);
        }
      });
      
      console.log(periodsCollection)
      await sendData(periodsCollection)
      return periodsCollection
    }
   
  }
 
  async function sendData(data:any) {
    const dataObject = data;
    let htmlContent = "";
    console.log(path.join(__dirname, "/../views/template.ejs"));
    ejs.renderFile(
      path.join(__dirname, "/../views/template.ejs"),
      { dataObject },
      (err: any, html: any) => {
        if (err) {
          console.error("Error rendering EJS template:", err);
          return;
        }
        htmlContent = html;
      },
    );

    if (!htmlContent) {
      return;
    }

    let browser;
    try {
      browser = await chromeAwsLambda.puppeteer.launch({
        args: chromeAwsLambda.args,
        executablePath: await chromeAwsLambda.executablePath || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: chromeAwsLambda.headless,
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 980, height: 970 });
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });
      const screenshotPath = "/tmp/template.png";
      await page.screenshot({ path: screenshotPath, fullPage: true });

      await browser.close();

      const bucket = admin.storage().bucket();
      const uploadResult = await bucket.upload(screenshotPath, {
        destination: `screenshots/${path.basename(screenshotPath)}`,
      });

      const file = uploadResult[0];

      await file.makePublic();

      const publicUrl = `${file.publicUrl()}?cacheBuster=${new Date().getTime()}`;
      await send(publicUrl);
      async function send(publicUrl: any) {
        const client = new postmark.ServerClient(
          "5bd26ba4-74b1-4336-b776-e14ef6c1c2ed",
        );
        const templateId = "send-email-data";
        const templateModel = {
          emailPhoto: publicUrl,
          appLink: data.appLink,
        };
        const emailOptions = {
          From: "orbit@tapforce.com",
          //To: data.userEmail,
          To: 'artur@tapforce.com',
          TemplateAlias: templateId,
          TemplateModel: templateModel,
          MessageStream: "outbound",
        };

        try {
          await client.sendEmailWithTemplate(emailOptions);

          return {
            success: true,
            message: "Email sent successfully.",
            publicUrl,
          };
        } catch (error) {
          // Log the error and return a failure response
          console.error("Error sending email", error);
          return {
            success: false,
            message: "Failed to send the email.",
            error: error instanceof Error ? error.message : error,
          };
        }
      }
    } catch (error) {
      console.error("Error in captureAndSend function:", error);
      await browser?.close();
      return;
    }
    return { success: true, message: "Email sent successfully." };
  }
});

/* async function sendEmailToUsers() {
  getDataForAllUsers()
  async function getDataForAllUsers() {
    const db = admin.firestore();
    const usersRef = db.collection('Users');
    const querySnapshot = await usersRef.where('email', '!=', '').where('weeklyReminder', '==', true).get();
  
    if (querySnapshot.empty) {
      console.log('No matching documents.');
      return [];
    }
  
  
    for (const userDoc of querySnapshot.docs) {
      const userData = userDoc.data();
      const userName = userData.name || 'User';
      const userEmail = userData.email;
  
      const periodsCollection: any = {
        weekly: [],
        monthly: [],
        quarterly: [],
        annually: [],
        userName: userName,
        userEmail: userEmail,
        appLink: "https://",
      };
  
      const personsRef = userDoc.ref.collection('Persons');
      const snapshot = await personsRef.get();
  
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const period = data.period;
        if (!periodsCollection[period]) continue;
      
        let imageLink;
        if (data.imageData) {
          const buffer = Buffer.from(data.imageData, 'binary');
          imageLink = `data:image/png;base64,${buffer.toString('base64')}`;
        } else {
          // Generate a URL using the UI Avatars API as before
          imageLink = `https://ui-avatars.com/api/?rounded=true&name=${encodeURIComponent(data.firstName ? data.firstName : data.lastName + ' ' + data.lastName ? data.lastName : data.firstName)}&size=64&background=e0e0e0&bold=true??color=020302`;
        }
      
        periodsCollection[period].push({
          ...data,
          imageLink,
          sortKey: data.checkins?.createdAt || 0
        });
      }
  
      Object.keys(periodsCollection).forEach(period => {
        if (['weekly', 'monthly', 'quarterly', 'annually'].includes(period)) {
          periodsCollection[period] = periodsCollection[period]
            .sort((a: any, b: any) => a.sortKey === 0 ? -1 : b.sortKey === 0 ? 1 : a.sortKey - b.sortKey)
            .slice(0, 5)
            .map((item: any) => item.imageLink);
        }
      });
      
      console.log(periodsCollection)
      sendData(periodsCollection)
      return periodsCollection
    }
   
  }
 
  async function sendData(data:any) {
    const dataObject = data;
    let htmlContent = "";
    console.log(path.join(__dirname, "/../views/template.ejs"));
    ejs.renderFile(
      path.join(__dirname, "/../views/template.ejs"),
      { dataObject },
      (err: any, html: any) => {
        if (err) {
          console.error("Error rendering EJS template:", err);
          return;
        }
        htmlContent = html;
      },
    );

    if (!htmlContent) {
      return;
    }

    let browser;
    try {
      browser = await chromeAwsLambda.puppeteer.launch({
        args: chromeAwsLambda.args,
        executablePath: await chromeAwsLambda.executablePath || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: chromeAwsLambda.headless,
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 980, height: 970 });
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });
      const screenshotPath = "/tmp/template.png";
      await page.screenshot({ path: screenshotPath, fullPage: true });

      await browser.close();

      const bucket = admin.storage().bucket();
      const uploadResult = await bucket.upload(screenshotPath, {
        destination: `screenshots/${path.basename(screenshotPath)}`,
      });

      const file = uploadResult[0];

      await file.makePublic();

      const publicUrl = `${file.publicUrl()}?cacheBuster=${new Date().getTime()}`;
      await send(publicUrl);
      async function send(publicUrl: any) {
        const client = new postmark.ServerClient(
          "5bd26ba4-74b1-4336-b776-e14ef6c1c2ed",
        );
        const templateId = "send-email-data";
        const templateModel = {
          emailPhoto: publicUrl,
          appLink: data.appLink,
        };
        const emailOptions = {
          From: "orbit@tapforce.com",
          //To: data.userEmail,
          To: 'roman@tapforce.com',
          TemplateAlias: templateId,
          TemplateModel: templateModel,
          MessageStream: "outbound",
        };

        try {
          await client.sendEmailWithTemplate(emailOptions);

          return {
            success: true,
            message: "Email sent successfully.",
            publicUrl,
          };
        } catch (error) {
          // Log the error and return a failure response
          console.error("Error sending email", error);
          return {
            success: false,
            message: "Failed to send the email.",
            error: error instanceof Error ? error.message : error,
          };
        }
      }
    } catch (error) {
      console.error("Error in captureAndSend function:", error);
      await browser?.close();
      return;
    }
    return { success: true, message: "Email sent successfully." };
  }
}
 */
