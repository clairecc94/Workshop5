import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

export async function node(
  nodeId: number,
  N: number,
  F: number,
  initialValue: Value,
  isFaulty: boolean,
  nodesAreReady: () => boolean,
  setNodeIsReady: (index: number) => void
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let killed = false;
  let x: 0 | 1 | "?" = isFaulty ? "?" : initialValue;
  let decided: boolean | null = isFaulty ? null : false;
  let k: number | null = isFaulty ? null : 0;
  let receivedVotes: Record<number, Record<number, Value>> = {};
  const MAX_RETRIES = 3; // Nombre max de tentatives pour les requêtes HTTP
  const RETRY_DELAY = 2000; // Délai entre les tentatives (2s)

  // 📌 Route pour récupérer l'état du nœud
  node.get("/getState", (req, res) => {
    res.json({ killed, x, decided, k });
  });

  node.get("/status", (req, res) => {
    if (isFaulty) {
      return res.status(500).send("faulty");
    }
    return res.status(200).send("live");
  });

  // 📩 **Route pour recevoir des messages**
  node.post("/message", (req, res) => {
    if (isFaulty || killed) {
      return res.status(400).json({ error: "Node is faulty or stopped" });
    }

    const { senderId, value, round } = req.body;
    if (value === null || value === undefined) {
      console.warn(`🚨 Node ${nodeId} received an invalid vote from Node ${senderId}`);
      return res.status(400).json({ error: "Invalid vote received" });
    }

    console.log(`📩 Node ${nodeId} received vote from Node ${senderId}: ${value} for round ${round}`);

    if (!receivedVotes[round]) receivedVotes[round] = {};
    receivedVotes[round][senderId] = value;

    console.log(`📥 Updated votes for Node ${nodeId} (Round ${round}):`, receivedVotes[round]);

    return res.status(200).json({ message: "Vote received" });
  });

  // 🚀 **Envoi de vote avec retries**
  async function sendVote(targetNodeId: number, value: Value, round: number) {
    const url = `http://localhost:${BASE_NODE_PORT + targetNodeId}/message`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Vérifier si le nœud cible est actif avant d'envoyer le vote
        const response = await fetch(`http://localhost:${BASE_NODE_PORT + targetNodeId}/status`);
        if (!response.ok) throw new Error(`Node ${targetNodeId} is not responding`);

        console.log(`🚀 Node ${nodeId} sending vote to Node ${targetNodeId} (Value: ${value}) - Attempt ${attempt}`);

        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderId: nodeId, value: value, round: round }),
        });

        console.log(`✅ Vote successfully sent to Node ${targetNodeId}`);
        return; // Sortie si succès
      } catch (error) {
        console.warn(`⚠️ Node ${nodeId} failed to send vote to Node ${targetNodeId}: ${error}`);

        if (attempt < MAX_RETRIES) {
          console.log(`🔄 Retrying in ${RETRY_DELAY / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        } else {
          console.error(`❌ Node ${nodeId} gave up on Node ${targetNodeId} after ${MAX_RETRIES} attempts.`);
        }
      }
    }
  }

  // 🔄 **Processus de consensus**
  node.get("/start", async (req, res) => {
    if (isFaulty || killed) {
      return res.status(400).json({ error: "Node is faulty or stopped" });
    }

    console.log(`🚀 Node ${nodeId} is starting the consensus process...`);

    const MAX_ROUNDS = 10;
    const majorityThreshold = Math.ceil((N + F) / 2);
    decided = false;
    k = 0;

    while (!decided && k !== null && k < MAX_ROUNDS) {
      console.log(`🔄 Node ${nodeId} - Round ${k}, Value: ${x}`);

      receivedVotes[k] = {}; // Réinitialiser les votes pour chaque round

      // 📤 **Étape 1 : Envoi du vote aux autres nœuds**
      for (let i = 0; i < N; i++) {
        if (i !== nodeId && x !== "?") {
          await sendVote(i, x, k); // Utilisation de la fonction avec retries
        }
      }

      // ⏳ **Étape 2 : Attente pour recevoir les votes**
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 📊 **Étape 3 : Analyse des votes reçus**
      const votes = receivedVotes[k] || {};
      const voteCounts = { 0: 0, 1: 0 };

      Object.values(votes).forEach((v) => {
        if (v === 0 || v === 1) voteCounts[v]++;
      });

      console.log(`📊 Node ${nodeId} received votes for round ${k}:`, votes);

      // 📌 **Étape 4 : Vérification de la majorité**
      let chosenValue: Value | "?" = "?";
      if (voteCounts[0] >= majorityThreshold) chosenValue = 0;
      if (voteCounts[1] >= majorityThreshold) chosenValue = 1;

      x = chosenValue !== "?" ? chosenValue : x;

      // ✅ **Étape 5 : Vérification d'une décision finale**
      if (voteCounts[0] > majorityThreshold) {
        x = 0;
        decided = true;
      } else if (voteCounts[1] > majorityThreshold) {
        x = 1;
        decided = true;
      }

      // 🔚 **Forcer une décision après `MAX_ROUNDS` pour éviter les blocages**
      if (k === MAX_ROUNDS - 1 && x === "?") {
        x = Math.random() < 0.5 ? 0 : 1;
        decided = true;
      }

      k++;
    }

    console.log(`✅ Node ${nodeId} has reached consensus: ${x}`);
    return res.status(200).json({ message: "Consensus reached", decision: x });
  });

  // 🛑 **Arrêt du consensus**
  node.get("/stop", async (req, res) => {
    killed = true;
    res.status(200).json({ message: "Consensus stopped" });
  });

  // 🎧 **Démarrer le serveur**
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`🎧 Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}
