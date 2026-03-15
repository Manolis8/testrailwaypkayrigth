import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import OpenAI from "openai";
import { execSync } from "child_process";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());

// Ensure Playwright browsers are installed at container startup
try {
  console.log("Installing Playwright browsers...");
  execSync("npx playwright install --with-deps", { stdio: "inherit" });
  console.log("Playwright browsers installed");
} catch (err) {
  console.error("Failed to install Playwright browsers", err);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SESSION_FILE = "session.json";

// Route to manually log in and save session
app.get("/setup", async (req, res) => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.linkedin.com/login");
  res.send(
    "Open the browser window, log in manually, then close the browser to save the session."
  );

  // Wait for user to close browser manually
  await browser.close();

  // Save session to file
  const contextForSaving = await chromium.launch().then(b => b.newContext());
  await contextForSaving.storageState({ path: SESSION_FILE });
  console.log("Session saved!");
});

// Plan task using OpenAI
async function planSteps(task) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are a browser automation planner. Convert tasks into Playwright steps. Return ONLY a JSON array of steps with {action,target,value}.",
      },
      { role: "user", content: task },
    ],
  });

  let text = response.choices[0].message.content;
  text = text.replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}

// Run steps with Playwright, reusing session if available
async function runSteps(steps) {
  const browser = await chromium.launch({ headless: true });
  const context = fs.existsSync(SESSION_FILE)
    ? await browser.newContext({ storageState: SESSION_FILE })
    : await browser.newContext();
  const page = await context.newPage();

  for (const step of steps) {
    console.log("Running step:", step);
    if (step.action === "navigate") await page.goto(step.target);
    if (step.action === "click") await page.click(step.target);
    if (step.action === "type") await page.fill(step.target, step.value);
    if (step.action === "wait") await page.waitForTimeout(Number(step.value));
    if (step.action === "scroll") await page.mouse.wheel(0, 1000);
  }

  await browser.close();
}

// Unified task handler
async function handleTask(req, res) {
  try {
    const { task } = req.body;
    if (!task) return res.status(400).json({ error: "Task is required" });

    console.log("Received task:", task);
    const steps = await planSteps(task);
    await runSteps(steps);

    res.json({ success: true, steps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Task failed" });
  }
}

app.post("/run-task", handleTask);
app.post("/execute", handleTask);
app.get("/", (req, res) => res.send("Automation server running"));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port", port));
