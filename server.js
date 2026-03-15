import express from "express"
import cors from "cors"
import { chromium } from "playwright"
import OpenAI from "openai"

const app = express()
app.use(cors())
app.use(express.json())

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

async function planSteps(task) {

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You are a browser automation planner. Convert tasks into Playwright steps. Return JSON array only."
      },
      {
        role: "user",
        content: task
      }
    ]
  })

  return JSON.parse(response.choices[0].message.content)
}

async function runSteps(steps) {

  const browser = await chromium.launch({ headless: true })

  const context = await browser.newContext()

  const page = await context.newPage()

  for (const step of steps) {

    if (step.action === "navigate") {
      await page.goto(step.target)
    }

    if (step.action === "click") {
      await page.click(step.target)
    }

    if (step.action === "type") {
      await page.fill(step.target, step.value)
    }

    if (step.action === "wait") {
      await page.waitForTimeout(Number(step.value))
    }

    if (step.action === "scroll") {
      await page.mouse.wheel(0, 1000)
    }

  }

  await browser.close()
}

app.post("/run-task", async (req, res) => {

  try {

    const { task } = req.body

    const steps = await planSteps(task)

    await runSteps(steps)

    res.json({
      success: true,
      steps
    })

  } catch (err) {

    console.error(err)

    res.status(500).json({
      error: "Task failed"
    })

  }

})

app.get("/", (req, res) => {
  res.send("Automation server running")
})

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log("Server running on port", port)
})