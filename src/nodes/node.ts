import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";
import axios from "axios";

type NodeState = {
  killed: boolean;
  x: 0 | 1 | "?" | null;
  decided: boolean | null;
  k: number | null;
};

type Message = {
  sender: number;
  value: Value;
  step: number;
};

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

  let state: NodeState = {
    killed: false,
    x: initialValue,
    decided: false,
    k: 0,
  };

  if (isFaulty) {
    state = {
      killed: false,
      x: null,
      decided: null,
      k: null,
    };
  }

  const messages: Message[] = [];
  let receivedMessagesCount = 0;

  // Route to get the current status of the node
  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  // Route to get the current state of the node
  node.get("/getState", (req, res) => {
    res.status(200).json(state);
  });

  // Route to receive messages from other nodes
  node.post("/message", (req, res) => {
    const message: Message = req.body;
    messages.push(message);
    receivedMessagesCount++;
    res.status(200).send("Message received");

    // Check if all messages are received
    if (receivedMessagesCount >= N - F) {
      decideValue();
    }
  });

  // Route to start the consensus algorithm
  node.get("/start", async (req, res) => {
    if (state.killed) {
      res.status(500).send("Node is killed");
      return;
    }

    // Wait until all nodes are ready
    while (!nodesAreReady()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Phase de Proposition
    for (let i = 0; i < N; i++) {
      if (i !== nodeId) {
        try {
          await axios.post(`http://localhost:${BASE_NODE_PORT + i}/message`, {
            sender: nodeId,
            value: state.x,
            step: state.k,
          });
        } catch (error) {
          console.error(`Failed to send message to node ${i}:`, error);
        }
      }
    }

    res.status(200).send("Consensus algorithm started");
  });

  // Route to stop the consensus algorithm
  node.get("/stop", (req, res) => {
    state.killed = true;
    res.status(200).send("Node stopped");
  });

  function decideValue() {
    // Phase de Collecte
    const values: Value[] = messages.map((msg) => msg.value);

    // Phase de Décision
    const valueCounts: { [key: string]: number } = {};
    values.forEach((value) => {
      valueCounts[value] = (valueCounts[value] || 0) + 1;
    });

    let decidedValue: Value | null = null;
    for (const value in valueCounts) {
      if (valueCounts[value] > N / 2) {
        decidedValue = value as Value;
        break;
      }
    }

    if (decidedValue !== null) {
      state.x = decidedValue;
      state.decided = true;
    }

    // Phase de Diffusion
    for (let i = 0; i < N; i++) {
      if (i !== nodeId) {
        try {
          axios.post(`http://localhost:${BASE_NODE_PORT + i}/message`, {
            sender: nodeId,
            value: state.x,
            step: state.k,
          });
        } catch (error) {
          console.error(`Failed to send message to node ${i}:`, error);
        }
      }
    }

    // Phase de Finalisation
    if (receivedMessagesCount >= N - F) {
      const finalValues: Value[] = messages.map((msg) => msg.value);
      const finalValueCounts: { [key: string]: number } = {};
      finalValues.forEach((value) => {
        finalValueCounts[value] = (finalValueCounts[value] || 0) + 1;
      });

      let finalDecidedValue: Value | null = null;
      for (const value in finalValueCounts) {
        if (finalValueCounts[value] > N / 2) {
          finalDecidedValue = value as Value;
          break;
        }
      }

      if (finalDecidedValue !== null) {
        state.x = finalDecidedValue;
        state.decided = true;
      }
    }
  }

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
