// import OpenAI from "openai";
// import fs from 'fs'; // For reading the text file with constants
// import axios from 'axios'; // If external requests are needed
// import path from "path";
const OpenAI =require("openai")
const fs=require("fs");
const axios = require("axios");
const {  getTopTABLE,
  getTopTEXT,
  getTopIMAGE, } = require('./embedding');

const path = require("path");
const openai = new OpenAI({apiKey:""});

const backendPORT="http://localhost:1800"
const promptRegex = /(querryClassificationPrompt|filterIrrelevantInfo|finalReplyFormatorPrompt|createGraphs):\n`([^`]*)`/g;



const filePath = path.join(__dirname, 'prompts.txt');
const promptsFile = fs.readFileSync(filePath, 'utf8');

const prompts = {};
let match;

while ((match = promptRegex.exec(promptsFile)) !== null) {
  const keyword = match[1];
  const promptText = match[2];
  prompts[keyword] = promptText;
}

const querryClassificationPrompt = `${prompts['querryClassificationPrompt']}`;
const filterIrrelevantInformation = `${prompts['filterIrrelevantInfo']}`;
const finalReplyFormatorPrompt = `${prompts['finalReplyFormatorPrompt']}`;
const createGraphs = `${prompts['createGraphs']}`;

let chatassistantId = "asst_5TYxlY689Cb1KRfISePvQHJC";
let classifiAssistant = "asst_T0iSoVS4e0rQfVJu7Nyyffqe";
let chatThread = null//"thread_UzrqmDuo9cbQ1PpYcr4FaFcE"//
let classifiThread = null;
let AllQueryList=[]

async function assistantAPI(thread, assistantId, query) {
  try {
    console.log("inside try");
    
    if (thread == null) {
      const New = await openai.beta.threads.create();
      thread = New.id;
    }

    console.log("step 0", thread);

    await openai.beta.threads.messages.create(thread, {
      role: 'user',
      content: query,
    });
    console.log("created thread");

    const runResponse = await openai.beta.threads.runs.create(thread, { assistant_id: assistantId });
    console.log("check this log", runResponse.status);

    const maxRetries = 20;
    const retryDelay = 2000; // 2 seconds
    let retries = 0;

    while (retries < maxRetries) {
      try {
        let run = await openai.beta.threads.runs.retrieve(thread, runResponse.id);
        console.log("Run status:", run.status);

        if (run.status === 'completed') {
          // Fetch and process the assistant's response
          const messagesResponse = await openai.beta.threads.messages.list(thread);
          const Object = await processAssistantResponse(messagesResponse, query);
          return Object;  // Return the processed object instead of using res
        } else if (run.status === 'failed') {
          throw new Error("Run failed: " + JSON.stringify(run.last_error));
        }

        // If not completed or failed, wait and retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retries++;
      } catch (error) {
        console.error("Error in retry loop:", error);
        if (retries === maxRetries - 1) {
          throw error; // Rethrow on last retry
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retries++;
      }
    }
    throw new Error("Max retries reached, unable to get a complete response");

  } catch (error) {
    console.error("Error in assistantAPI:", error);
    throw error;  // Return or throw the error, don't use `res`
  }
}



async function processAssistantResponse(messagesResponse, query) {
  const returnObject = {
    image_file: [],
    text: [],
  };
  let TEXT;

  if (messagesResponse.data && Array.isArray(messagesResponse.data)) {
    const assistantResponses = messagesResponse.data.filter(msg => msg.role === 'assistant');
    console.log("Filtered Assistant Responses:", assistantResponses[0].content);

    for (const message of assistantResponses[0].content) {
      console.log("Processing message:", message);
      if (message.type === "image_file") {
        const imagePath = await saveImageFile(message.image_file.file_id);
        returnObject.image_file.push(imagePath);
      } else if (message.type === "text") {
        TEXT= message.text.value
        returnObject.text.push(TEXT);
      }
    }
  } else {
    console.error("No data found in the response.");
  }

  const response = await getTopIMAGE(`${query}\n${TEXT}`)
  console.log("############33",response);
  imageName=response[0]
  console.log("Expected chunk to be a string but got:", typeof response[0])

  const Name = await extractImageName(response[0]); 
  returnObject.pdf_path=Name;

  return returnObject;
}

async function saveImageFile(fileId) {
  try {
    const image_data = await openai.files.content(fileId);
    console.log("we got image",image_data);

    const image_data_bytes = await image_data.arrayBuffer();
    let no = Math.floor(100 + Math.random() * 900);
    
    const imageDir = path.join(__dirname, 'image');
    console.log(imageDir);
    const imagePath = path.join(imageDir, `${no}.png`);  // Use path.join for cross-platform compatibility

    // Ensure the directory exists
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }

    // Write the file
    await fs.promises.writeFile(imagePath, Buffer.from(image_data_bytes));
    console.log("Image saved:", imagePath);

    //just want to return the file name
    const Justpath=`${no}.png`
    return Justpath;
  } catch (error) {
    console.error("Error saving image file:", error);
    return null;
  }
}

async function extractImageName(chunk) {
  // Remove any unwanted characters (newlines, excessive spaces) to clean the string.
  const cleanedChunk = chunk.replace(/[\n\r]+/g, '').replace(/\s{2,}/g, ' ');

  try {
    // Convert the cleaned chunk into a JSON object
    const jsonString = cleanedChunk.match(/\{.*\}/)[0]; // Extract the JSON part
    const parsedData = JSON.parse(jsonString);  // Parse JSON from string
    
    // Access the image name
    const imageName = parsedData.image_name;
    
    console.log("Extracted Image Name:", imageName);
    return imageName;
  } catch (error) {
    console.error("Error parsing JSON:", error);
    return null;
  }
}

// Function to format the final reply
const formatReply = async (query) => {
  Q= query+"\n Plase must visualize the stats by generating graphs and charts using code interpreter"
  const answer= await assistantAPI(chatThread, "asst_5TYxlY689Cb1KRfISePvQHJC", Q);
  console.log(answer);
  return answer;
};


// API function for handling file upload (PDF chunking logic)
const uploadPDFs = async (files) => {
  // Implement logic for chunking PDF information here
  console.log('Received files for chunking:', files);
};

// const happy=async()=> {
// const A= await formatReply("okay how are the salaries taking up the chunk visualize it with colourfull piechart. use code interpreter")
// console.log(A);
// return 
// }

// happy().then(() => {
//   console.log("what the revenue we made in a ");
// }).catch((err) => {
//   console.error("Error occurred in happy function:", err);
// });

module.exports = { formatReply, uploadPDFs }


































// // Function for query classification
// export const classifyQuery = async (query) => {
//   const questions= await assistantAPI(query, classifiThread, classifiAssistant )
// };

// // Function for semantic search
// export const semanticSearch = async (queries) => {
//   const searchResults = [];

//   for (let i = 0; i < queries.length; i++) {
//     const top3Results = await getTop3Results(queries[i]);
//     searchResults.push({
//       query: queries[i],
//       searchResults: top3Results
//     });
//   }

//   return searchResults;
// };

// // Simulated function to get top 3 search results (this can be integrated with your actual search logic)
// const getTop3Results = async (query) => {
//   // Placeholder logic to get top 3 results
//   return [`Result1 for ${query}`, `Result2 for ${query}`, `Result3 for ${query}`];
// };

// // Function for filtering irrelevant or repeated information
// export const filterIrrelevantInfo = async (searchResults) => {
//   const context = JSON.stringify(searchResults); // Convert to a string
//   const completion = await openai.chat.completions.create({
//     messages: [{ role: "system", content: filteringSystemPrompt }, { role: "user", content: context }],
//     model: "gpt-4o-mini",
//     temperature: 0
//   });

//   const usefulContext = completion.choices[0].message.content;
//   return usefulContext;
// };


// // API function for handling queries
// export const processQuery1 = async (query) => {
//   AllQueryList.append(query);
//   // Step 1: Query classification
  
//   const probableQueries = await classifyQuery(query);

//   // Step 2: Perform semantic search for each query
//   const searchResults = await semanticSearch(probableQueries);

//   // Step 3: Filter irrelevant or repeated information
//   const usefulContext = await filterIrrelevantInfo(AllQueryList,searchResults);

//   // Step 5: Generate a final reply
//   const finalReply = await formatReply(query, usefulContext);

//     // Step 4: Get images related to search results
//   const imagePaths = await getImagesFromSearchResults(finalReply, usefulContext);

//   return { finalReply, imagePaths };
// };
