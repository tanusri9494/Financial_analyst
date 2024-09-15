const fs = require("fs");
const OpenAI =require("openai");
const { promisify } = require("util");
const readFile = promisify(fs.readFile);
const dotenv = require("dotenv");
const flatCache = require("flat-cache");
const path = require("path");

const openai = new OpenAI({apiKey:""});

async function createEmbeddings(storyFile) {
  const story = await readFile(storyFile, "utf-8");
  const docChunks = story.split("###").map((doc) => doc.trim());

  const embeddings = [];
  let count = 0;
  for (let chunk of docChunks) {
    console.log(count++);
    console.log(chunk);
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunk,
    });
    const embed=response.data[0].embedding
    embeddings.push(embed);
  }
  console.log(embeddings.length);

  return { embeddings, docChunks };
}

// async function initializeCreateEmbeddings() {
//   const { embeddings, docChunks } = await createEmbeddings("ALL_DATA\\document_text.txt");
//   console.log("initialized CreateEmbeddings!")
//   return { embeddings, docChunks };
// }



// Define the cache file path and load the cache

async function initializeCreateEmbeddings(force = false, add = false, path, text_path) {
  let oldEmbeddings, oldDocChunks;
  //const cacheFilePath = path.join(__dirname, path);
  const cache = flatCache.load("embeddingsCache", path);

  if (!force) {
    // Check if the cache already contains embeddings and docChunks
    oldEmbeddings = cache.getKey("embeddings");
    oldDocChunks = cache.getKey("docChunks");

    if (oldEmbeddings && oldDocChunks) {
      console.log("Loaded embeddings and docChunks from cache");
      return { embeddings: oldEmbeddings, docChunks: oldDocChunks };
    }
  } else {
    console.log("Forcing re-creation of embeddings and docChunks");
  }

  const { embeddings: newEmbeddings, docChunks: newDocChunks } =
    await createEmbeddings(`ALL_DATA\\${text_path}`);
  console.log("initialized CreateEmbeddings!");

  let mergedEmbeddings, mergedDocChunks;

  if (add) {
    // Merge new embeddings and docChunks with the old ones
    mergedEmbeddings = oldEmbeddings
      ? [...oldEmbeddings, ...newEmbeddings]
      : newEmbeddings;
    mergedDocChunks = oldDocChunks
      ? [...oldDocChunks, ...newDocChunks]
      : newDocChunks;

    console.log("added new Embaddings into old");
  } else {
    // Replace old cache with the new embeddings and docChunks
    mergedEmbeddings = newEmbeddings;
    mergedDocChunks = newDocChunks;
    console.log("replacing old embaddings with new");
  }

  // Cache the merged embeddings and docChunks
  cache.setKey("embeddings", mergedEmbeddings);
  cache.setKey("docChunks", mergedDocChunks);
  cache.save(); // Save the updated cache to disk

  return { embeddings: mergedEmbeddings, docChunks: mergedDocChunks };
}




async function getCachedEmbeddingsAndChunks(cachePath) {

    const cache = flatCache.load('embeddingsCache', cachePath);
  
    const embeddings = cache.getKey('embeddings');
    const docChunks = cache.getKey('docChunks');

    return { embeddings, docChunks };
}






async function semanticSearch(query, embeddings, docChunks, n = 10) {

    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      });
  const queryEmbedding = response.data[0].embedding

  const cosineSimilarity = (a, b) => {
    const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  };

  const similarities = embeddings.map((embedding) =>
    cosineSimilarity(embedding, queryEmbedding),
  );
  const topIndices = similarities
    .map((sim, idx) => idx)
    .sort((a, b) => similarities[b] - similarities[a])
    .slice(0, n);

  const topChunks = topIndices.map((idx) => ({
    chunk: docChunks[idx],
    score: similarities[idx],
  }));

  return topChunks;
}
let list = [];

async function getTopTABLE(query) {
  console.log('in fun %%%%%%%%%%')
  const { embeddings, docChunks } = await getCachedEmbeddingsAndChunks("_cache");
  const topChunks = await semanticSearch(query, embeddings, docChunks, 2);
  topChunks.forEach((item) => {

    if (item.score >= 0.) {
      list.push(item.chunk);
    }
  });
  console.log("TABLE", list);
  return list;
}



async function getTopTEXT(query) {
    const { embeddings, docChunks } = await getCachedEmbeddingsAndChunks("_chunks");
    const topChunks = await semanticSearch(query, embeddings, docChunks, 3);
    topChunks.forEach((item) => {

      if (item.score >= 0) {
        list.push(item.chunk);
      }
    });
  
    console.log("text", topChunks);
    return list;
  }

async function getTopIMAGE(query) {
    const { embeddings, docChunks } = await getCachedEmbeddingsAndChunks("_images");
    const topChunks = await semanticSearch(query, embeddings, docChunks, 1);
    topChunks.forEach((item) => {
        if (item.score >= 0) {
            list.push(item.chunk);
        }
    });
  
    //console.log("Images", topChunks);
    return list;
}
  
//initializeCreateEmbeddings(false, true);



//const table = initializeCreateEmbeddings("false","false","_cache","document_tables.txt");
//const text = initializeCreateEmbeddings("false","true","_chunks","document_text.txt");
//const images = initializeCreateEmbeddings("false","true","_images","images_meta.txt");


// (async () => {

//     // const response = await openai.embeddings.create({
//     //     model: "text-embedding-3-small",
//     //     input: "bhaii ",
//     //   });

//     // console.log(response.data[0].embedding);

//     try {
//     const table= await getTopIMAGE("How are sales looking like this year?")
//     console.log( table);

//     // input= table[0]
//     // const parsedInput = JSON.parse(input);
//     // const imageName = parsedInput.image_name
//     // console.log(`File Name=${imageName}`);
//     }catch(error){
//         console.log(error)
//     }
// })();

module.exports = {
  getTopTABLE,
  getTopTEXT,
  getTopIMAGE,
};
