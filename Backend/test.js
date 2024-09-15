const fs = require('fs').promises;
const Fs = require('fs');
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');
const axios = require('axios');
const Jimp= require('jimp');

const IMAGE_FOLDER = path.join(process.cwd(), 'ALL_DATA');
const TEXT_FILE = `${IMAGE_FOLDER}\\text.txt`;
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

async function ensureFoldersExist() {
    try {
      await fs.mkdir(IMAGE_FOLDER, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
  }
  

async function extractDocumentInfo(auth) {
  const docs = google.docs({ version: 'v1', auth });

  const documentId = '1TaMIIIZ7wtpAICpjejf7a7TMJJcEl_Xa9wfrntQIIB0'; // Replace with your document ID
  try {
    const res = await docs.documents.get({ documentId });
    const document = res.data;

    await ensureFoldersExist();

    let allText = '';  // To store the final text
    let currentChunk = '';  // Current chunk being built
    let chunkWordCount = 0;  // To count the number of words in the chunk

    let imagesMeta = [];
    let tablesData = '';
    let currentTable = null;

    for (let i = 0; i < document.body.content.length; i++) {
      const element = document.body.content[i];

      // Handle headings (Main heading or Subheading)
      if (element.paragraph && element.paragraph.paragraphStyle) {
        const heading = extractText(element.paragraph);
        if (heading) {
          if (chunkWordCount >= 200) {
            // If current chunk has 200+ words, finalize the current chunk
            allText += currentChunk.trim() + '\n\n';
            currentChunk = '';  // Reset chunk
            chunkWordCount = 0;  // Reset word count
          }
          // Add heading to the current chunk
          currentChunk += `### ${heading}\n\n`;
        }
      }

      // Handle text paragraphs
      if (element.paragraph && !element.paragraph.paragraphStyle) {
        const paragraphText = extractText(element.paragraph);
        if (paragraphText) {
          currentChunk += `${paragraphText}\n\n`;
          chunkWordCount += countWords(paragraphText);
        }
      }

      // Handle images (also gather context paragraphs)
      if (element.inlineObjectElement) {
        const imageMeta = await handleImage(
          element.inlineObjectElement,
          docs,
          documentId,
          i,
          document.body.content
        );
        if (imageMeta) {
          imagesMeta.push(imageMeta);
        }
      }

      // Handle tables
      if (element.table) {
        if (!currentTable) {
          currentTable = extractTable(element.table);
        } else {
          currentTable = mergeTables(currentTable, extractTable(element.table));
        }

        // Check for split tables
        let nextElement = document.body.content[i + 1];
        let nextToNextElement = document.body.content[i + 2];

        if (nextElement && nextElement.table) {
          currentTable = mergeTables(currentTable, extractTable(nextElement.table));
          i++;
        } else if (nextToNextElement && nextToNextElement.table) {
          currentTable = mergeTables(currentTable, extractTable(nextToNextElement.table));
          i += 2;
        }

        // Store table within the text document
        const tableText = convertTableToCSV(currentTable);
        currentChunk += `${tableText}\n\n`;  // Add to current chunk
        tablesData += `###\n${tableText}\n\n`;

        currentTable = null;  // Reset table tracking
      }

      // Handle chunk finalization based on word count
      if (chunkWordCount >= 200) {
        allText += currentChunk.trim() + '\n\n';
        currentChunk = '';  // Reset for next chunk
        chunkWordCount = 0;  // Reset word count
      }
    }

    // Append any remaining chunk
    if (currentChunk.trim()) {
      allText += currentChunk.trim() + '\n\n';
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

// Utility function to count the words in a string
function countWords(text) {
    console.log(count)
  return text.trim().split(/\s+/).length;
}

// Extract text from a paragraph element (unchanged)
function extractText(paragraph) {
  if (paragraph.elements && paragraph.elements.length > 0) {
    return paragraph.elements
      .map(el => (el.textRun && el.textRun.content) ? el.textRun.content.trim() : '')
      .filter(text => text.length > 0)
      .join(' ');
  }
  return '';
}

// Other helper functions (handleImage, extractTable, mergeTables, etc.) remain the same.



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

authorize().then(extractDocumentInfo).catch(console.error);