const { onCall, HttpsError } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const vision = require('@google-cloud/vision');
const { FieldValue } = require("firebase-admin/firestore");
const { VertexAI } = require('@google-cloud/vertexai');

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// =========================================================================================
// AI BIOGRAPHY FUNCTION (Corrected Version)
// =========================================================================================
exports.generateBioFromPrompts = onCall(async (request) => {
    // Check if the user is authenticated
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to use this feature.');
    }

    const { name, promptData } = request.data;
    if (!name || !promptData) {
        throw new HttpsError('invalid-argument', 'The function must be called with "name" and "promptData".');
    }

    // Initialize Vertex AI with a specific project and location
    const vertex_ai = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: 'us-central1' });
    const model = 'gemini-1.5-flash-001'; // A fast and effective model

    const generativeModel = vertex_ai.getGenerativeModel({
        model: model,
    });

    const prompt = `You are a compassionate biographer. Write a warm, heartfelt, and well-written biography for a memorial website. The biography should be a single, cohesive paragraph.
    
    The person's name is: ${name}
    
    Here are some notes and memories provided by their family. Use these notes to write the biography. Do not treat them as a list of questions to answer; instead, weave the details into a natural narrative:
    - ${promptData}

    Biography:`;

    try {
        const resp = await generativeModel.generateContent(prompt);
        const bioText = resp.response.candidates[0].content.parts[0].text;
        return { biography: bioText };
    } catch (error) {
        console.error("Error generating content from Vertex AI:", error);
        throw new HttpsError('internal', 'Failed to generate biography from AI service.', error);
    }
});


// =========================================================================================
// EXISTING FUNCTIONS
// =========================================================================================
exports.geocodeAddress = onCall((request) => {
    const address = request.data.address;
    if (!address) {
        throw new HttpsError('invalid-argument', 'The function must be called with an "address" argument.');
    }
    console.log(`Geocoding placeholder for address: ${address}`);
    // Replace with a real geocoding service call in production
    return { lat: 40.7128, lng: -74.0060 };
});

exports.transcribeHeadstoneImage = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in.');
    }
    const imageUrl = request.data.imageUrl;
    if (!imageUrl) {
        throw new HttpsError('invalid-argument', 'The function must be called with an "imageUrl" argument.');
    }
    try {
        const visionClient = new vision.ImageAnnotatorClient();
        const [result] = await visionClient.textDetection(imageUrl);
        const detections = result.textAnnotations;
        const fullText = detections.length > 0 ? detections[0].description : 'No text found.';
        return { text: fullText };
    } catch (error) {
        console.error("Vision API Error:", error);
        throw new HttpsError('internal', 'Failed to process image with Vision API.');
    }
});

exports.approveAndLinkSubmission = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in.');
    }
    const { submissionId, curatorId } = request.data;
    if (!submissionId || !curatorId) {
        throw new HttpsError('invalid-argument', 'Missing submissionId or curatorId.');
    }
    const submissionRef = db.collection('memorials').doc(submissionId);
    return db.runTransaction(async (transaction) => {
        const submissionDoc = await transaction.get(submissionRef);
        if (!submissionDoc.exists) {
            throw new HttpsError('not-found', 'Submission document does not exist.');
        }
        const submissionData = submissionDoc.data();
        const updateForNewMemorial = { status: 'approved', curatorId: curatorId };
        if (submissionData.sourceMemorialId) {
            const sourceMemorialRef = db.collection('memorials').doc(submissionData.sourceMemorialId);
            const sourceMemorialDoc = await transaction.get(sourceMemorialRef);
            if (sourceMemorialDoc.exists) {
                const sourceData = sourceMemorialDoc.data();
                let existingRelatives = sourceData.relatives || [];
                const relativeIndex = existingRelatives.findIndex(
                    rel => rel.name === submissionData.name && !rel.memorialId
                );
                if (relativeIndex > -1) {
                    existingRelatives[relativeIndex].memorialId = submissionId;
                    if (submissionData.relationshipToSource) {
                        existingRelatives[relativeIndex].relationship = submissionData.relationshipToSource;
                    }
                    transaction.update(sourceMemorialRef, { relatives: existingRelatives });
                } else {
                    const newRelative = {
                        name: submissionData.name,
                        relationship: submissionData.relationshipToSource || 'Relative',
                        memorialId: submissionId
                    };
                    transaction.update(sourceMemorialRef, { relatives: FieldValue.arrayUnion(newRelative) });
                }
                const reverseRelative = {
                    name: sourceData.name,
                    relationship: "Relative", // You might want a better reciprocal logic here
                    memorialId: submissionData.sourceMemorialId
                };
                updateForNewMemorial.relatives = [reverseRelative];
            }
        }
        transaction.update(submissionRef, updateForNewMemorial);
        return { success: true };
    });
});

exports.upgradeMemorialTier = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to upgrade a plan.');
    }
    const { memorialId, newTier } = request.data;
    if (!memorialId || !newTier) {
        throw new HttpsError('invalid-argument', 'The function must be called with "memorialId" and "newTier" arguments.');
    }
    const memorialRef = db.collection('memorials').doc(memorialId);
    const curatorId = request.auth.uid;
    const tierSortMap = {
        'historian': 1,
        'legacy': 2,
        'storyteller': 3,
        'memorial': 4
    };
    const doc = await memorialRef.get();
    if (!doc.exists) {
        throw new HttpsError('not-found', 'No memorial found with that ID.');
    }
    const memorialData = doc.data();
    if (memorialData.curatorId !== curatorId) {
        throw new HttpsError('permission-denied', 'You do not have permission to upgrade this memorial.');
    }
    await memorialRef.update({
        tier: newTier,
        tierSortOrder: tierSortMap[newTier] || 4
    });
    return { success: true, message: `Memorial upgraded to ${newTier}!` };
});

exports.manageReciprocalRelationships = functions.firestore
    .document("memorials/{memorialId}")
    .onUpdate(async (change, context) => {
        const memorialId = context.params.memorialId;
        const afterData = change.after.data();
        
        // Anti-loop mechanism: check if a function recently updated this doc
        const lastUpdate = afterData.lastUpdatedByFunction;
        if (lastUpdate && (Date.now() - lastUpdate.toMillis() < 10000)) {
            console.log(`Skipping function for ${memorialId} to prevent loop.`);
            return null;
        }

        const beforeData = change.before.data();
        const oldLinks = new Map((beforeData.relatives || []).filter(r => r.memorialId).map(r => [r.memorialId, r]));
        const newLinks = new Map((afterData.relatives || []).filter(r => r.memorialId).map(r => [r.memorialId, r]));
        const batch = db.batch();
        const markAsUpdated = { lastUpdatedByFunction: FieldValue.serverTimestamp() };

        // Process new or changed links
        for (const [relativeId, newRelativeData] of newLinks.entries()) {
            if (!oldLinks.has(relativeId)) { // Only process newly added links
                const relativeDocRef = db.collection("memorials").doc(relativeId);
                const reciprocalLink = {
                    name: afterData.name,
                    relationship: getReciprocalRelationship(newRelativeData.relationship),
                    memorialId: memorialId,
                };
                batch.update(relativeDocRef, { 
                    relatives: FieldValue.arrayUnion(reciprocalLink),
                    ...markAsUpdated 
                });
            }
        }

        // Process removed links
        for (const [relativeId] of oldLinks.entries()) {
            if (!newLinks.has(relativeId)) {
                const relativeDocRef = db.collection("memorials").doc(relativeId);
                const relativeDoc = await relativeDocRef.get();
                if (relativeDoc.exists) {
                    const relativesOfRelative = (relativeDoc.data().relatives || []).filter(r => r.memorialId !== memorialId);
                    batch.update(relativeDocRef, { 
                        relatives: relativesOfRelative,
                        ...markAsUpdated
                    });
                }
            }
        }
        return batch.commit();
    });

function getReciprocalRelationship(relationship) {
    if (!relationship) return "Relative";
    const lowerCaseRelationship = relationship.toLowerCase().trim();
    const map = {
        "parent": "Child", "child": "Parent",
        "spouse": "Spouse", "husband": "Wife", "wife": "Husband",
        "sibling": "Sibling", "brother": "Brother", "sister": "Sister",
        "grandparent": "Grandchild", "grandmother": "Grandson/Granddaughter", "grandfather": "Grandson/Granddaughter",
        "grandchild": "Grandparent", "grandson": "Grandfather/Grandmother", "granddaughter": "Grandfather/Grandmother",
        "aunt": "Niece/Nephew", "uncle": "Niece/Nephew",
        "cousin": "Cousin",
        "mother": "Son/Daughter", "father": "Son/Daughter",
        "son": "Father/Mother", "daughter": "Father/Mother",
    };
     if (lowerCaseRelationship.includes("niece") || lowerCaseRelationship.includes("nephew")) {
        return "Aunt/Uncle";
    }
    return map[lowerCaseRelationship] || "Relative";
}