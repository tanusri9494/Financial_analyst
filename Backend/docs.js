const fs = require('fs').promises;
const Fs = require('fs');
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');
const axios = require('axios');
const Jimp= require('jimp');


// Define output folder structure

const IMAGE_FOLDER = path.join(process.cwd(), 'ALL_DATA');
const TEXT_FILE = `${IMAGE_FOLDER}\\document_text.txt`;
const TABLES_FILE = `${IMAGE_FOLDER}\\document_tables.txt`;

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/documents.readonly','https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.metadata.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Prints the title of a sample doc:
 * https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth 2.0 client.
 */


async function uploadAndConvertDocx(auth) {
    const drive = google.drive({version: 'v3', auth});
    
    // File path to the .docx file
    const filePath = path.join(process.cwd(), 'avanza-bank-holding-ab-annual-and-sustainability-report-2021-pdf.doc'); // Replace 'your-file.docx' with the actual filename
    
    const fileMetadata = {
      'name': 'Uploaded Word File',
      'mimeType': 'application/vnd.google-apps.document'
    };
  
    const media = {
      mimeType: 'application/msword',
      body: Fs.createReadStream(filePath),
    };
    try {
        const res = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
            supportsAllDrives: true,
            convert: true,
        });
    }catch(error){
        if (error.response && error.response.data && error.response.data.error) {
            console.error('Error details:', JSON.stringify(error.response.data.error, null, 2));
          } else {
            console.error('Error uploading and converting file:', error.message);
          }
        throw error;
    }

    console.log(`File uploaded and converted to Google Docs. Document ID: ${res.data.id}`);
    return res.data.id;
}

// authorize().then(uploadAndConvertDocx).catch(console.error);


// Ensure output folders exist
async function ensureFoldersExist() {
    try {
      await fs.mkdir(IMAGE_FOLDER, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
  }
  
  // Main function to extract text, tables, and images
async function extractDocumentInfo(auth) {
    const docs = google.docs({ version: 'v1', auth });
  
    // Replace with your document ID
    const documentId = '1TaMIIIZ7wtpAICpjejf7a7TMJJcEl_Xa9wfrntQIIB0';
  
    try {
      const res = await docs.documents.get({ documentId: documentId });
      const document = res.data;
  
      await ensureFoldersExist();
  
      let allText = '';
      let tablesData = '';
      let imagesMeta = [];
  
      let currentTopic = '';
      let currentTable = null;
  
      for (let i = 0; i < document.body.content.length; i++) {
        const element = document.body.content[i];
  
        // Handle headings (topics and subtopics)
        if (element.paragraph && element.paragraph.paragraphStyle) {
          const heading = extractText(element.paragraph);
          if (heading) {
            currentTopic = heading;
            allText += `### ${heading}\n\n`;
          }
        }
  
        // Handle text paragraphs
        if (element.paragraph && !element.paragraph.paragraphStyle) {
          const paragraphText = extractText(element.paragraph);
          if (paragraphText) {
            allText += `${paragraphText}\n\n`;
          }
        }
  
        // handel Images
        console.log("###########################");
        if(element.paragraph && element.paragraph.elements ){
            for(const el of element.paragraph.elements){
                if(el.inlineObjectElement){
                    const imageId=el.inlineObjectElement.inlineObjectId
                    const inlineObject = document.inlineObjects[imageId];
                    if (inlineObject) {
                        const embeddedObject = inlineObject.inlineObjectProperties.embeddedObject;
                        if (embeddedObject.imageProperties && embeddedObject.imageProperties.contentUri) {
                          const imageUrl = embeddedObject.imageProperties.contentUri;
                          console.log(`Image URL: ${imageUrl}`);
                        
                          let topPara=null;
                          let bottomPara=null;

                          if(i>0 && document.body.content[i-1].paragraph){
                            topPara= extractText(document.body.content[i-1].paragraph);
                          }

                          if (i < document.body.content.length - 1 && document.body.content[i + 1].paragraph) {
                            const nextElement = document.body.content[i + 1];
                            // Check if the next paragraph is a heading or subheading, and if not, extract text
                            if (!isHeading(nextElement.paragraph)) {
                              bottomPara = extractText(nextElement.paragraph);
                            }
                          }

                          // Step 3: Download image
                          const filename = `image_${i + 1}.jpg`; // Image naming convention
                          await downloadImage(imageUrl, filename);
                        
                                      // Step 4: Save metadata
                          imagesMeta.push({
                            image_name: filename,
                            meta_description: {
                            top_para: topPara || null,
                            bottom_para: bottomPara || null,
                          }
                        });
 
                        } else {
                          console.log('Image properties or contentUri not found.');
                        }
                    } else {
                        console.log(`Inline object with ID ${el} not found.`);
                    }
                }
            }
    
          }
          console.log("###########################");


  
        // Handle tables
        if (element.table) {
          if (!currentTable) {
            currentTable = extractTable(element.table);
          } else {
            currentTable = mergeTables(currentTable, extractTable(element.table));
          }
  
          // Check for split tables in subsequent elements
          let nextElement = document.body.content[i + 1];
          let nextToNextElement = document.body.content[i + 2];
  
          if (nextElement && nextElement.table) {
            currentTable = mergeTables(currentTable, extractTable(nextElement.table));
            i++;
          } else if (nextToNextElement && nextToNextElement.table) {
            currentTable = mergeTables(currentTable, extractTable(nextToNextElement.table));
            i += 2;
          }
  
          // Store table in the text document and also separately in CSV format
          const tableText = convertTableToCSV(currentTable);
          allText += `${tableText}\n\n`;
          tablesData += `\n###\n${tableText}\n\n`;
  
          currentTable = null;
        }
      }
  
      // Write outputs to files
      await fs.writeFile(TEXT_FILE, allText.trim());
      await fs.writeFile(TABLES_FILE, tablesData.trim());
      await fs.writeFile(path.join(IMAGE_FOLDER, 'images_meta.json'), JSON.stringify(imagesMeta, null, 2));
  
      console.log('Document extraction complete! Check the output files.');
  
    } catch (err) {
      console.error('Error extracting document:', err);
    }
  }
  
  // Extract text from a paragraph element
  function extractText(paragraph) {
    if (paragraph.elements && paragraph.elements.length > 0) {
      return paragraph.elements
        .map(el => (el.textRun && el.textRun.content) ? el.textRun.content.trim() : '')
        .filter(text => text.length > 0)
        .join(' ');
    }
    return '';
  }
  

function isHeading(paragraph) {
    const headingStyles = ['HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'HEADING_5', 'HEADING_6'];
    return paragraph.paragraphStyle && headingStyles.includes(paragraph.paragraphStyle.namedStyleType);
}

  // Extract tables from a table element
function extractTable(table) {
    const rows = [];
    for (const row of table.tableRows) {
      const cells = [];
      for (const cell of row.tableCells) {
        const cellContent = extractTextFromCell(cell);
        cells.push(cellContent);
      }
      rows.push(cells);
    }
    return { rows };
}
  
  // Helper to merge two tables (for handling split tables)
function mergeTables(table1, table2) {
    const mergedTable = { rows: [...table1.rows] };
    for (const row of table2.rows) {
      mergedTable.rows.push(row);
    }
    return mergedTable;
}
  
  // Convert a table to CSV format
function convertTableToCSV(table) {
    return table.rows.map(row => row.join(',')).join('\n');
}
  
  // Extract text from table cells
function extractTextFromCell(cell) {
    const content = [];
    if (cell.content) {
      for (const element of cell.content) {
        if (element.paragraph) {
          content.push(extractText(element.paragraph));
        }
      }
    }
    return content.join(' ').trim();
}
  
  // Handle image extraction and saving with context paragraphs
// async function handleImage(inlineObjectElement, docs, documentId, index, content) {
//     const inlineObjectId = inlineObjectElement.inlineObjectId;
//     const res = await docs.documents.get({ documentId, fields: `inlineObjects(${inlineObjectId})` });
//     const inlineObject = res.data.inlineObjects[inlineObjectId];
//     const embeddedObject = inlineObject.inlineObjectProperties.embeddedObject;
  
//     if (embeddedObject.imageProperties) {
//       const imageURL = embeddedObject.imageProperties.contentUri;
//       const imageName = `image_${inlineObjectId}.jpg`;
  
//       // Fetch the image
//       await downloadImage(imageURL, path.join(IMAGE_FOLDER, imageName));
  
//       // Get context paragraphs before and after the image
//       const topParagraph = index > 0 ? extractText(content[index - 1].paragraph) : null;
//       const bottomParagraph = index + 1 < content.length ? extractText(content[index + 1].paragraph) : null;
  
//       return {
//         image_name: imageName,
//         meta_description: {
//           top_para: topParagraph || null,
//           bottom_para: bottomParagraph || null
//         }
//       };
//     }
// }
  
// Download the image from a URL and save it to a folder
async function downloadImage(url, filename) {
  
    console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@");
    console.log(IMAGE_FOLDER)
    const relativeFilePath = path.join(IMAGE_FOLDER, filename);  // Relative path (for returning/storing)
    const filePath = `${IMAGE_FOLDER}\\${filename}`
    console.log(filePath);  // Absolute path (for writing)
    console.log("@@@@@@@@@@@@@@@@@@@@@@@@@@@@");

    try {
        const response = await axios({
            url,
            responseType: 'arraybuffer', // Ensure we get the data as a buffer
        });

        const buffer = response.data;
        await fs.writeFile(filePath, buffer);
        console.log(`Image saved to ${filePath}`);

        // // Load the image with Jimp and add a white background if it's transparent
        // const image = await Jimp.read(buffer);
        // const whiteBg = new Jimp(image.bitmap.width, image.bitmap.height, 0xFFFFFFFF); // Create a white background
        // whiteBg.composite(image, 0, 0); // Combine the white background with the original image
                
        // // Save the image
        // await whiteBg.writeAsync(filePath);
    } catch (error) {
        console.error(`Error downloading image: ${error.message}`);
    }
}

  
  // Authenticate and extract document info
  authorize().then(extractDocumentInfo).catch(console.error);