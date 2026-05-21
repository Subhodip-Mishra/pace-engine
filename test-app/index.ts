import express from "express";
import { Pace } from "@pace/sdk-node";

const app = express();

const pace = new Pace({
  mode: "active",
  debug: "pretty",
});

app.use(express.static("public"));

app.post(
  "/generate",
  pace.limit({
    algorithm: "fixed_window",
    limit: 5,
    window: "1m",
  }),
  async (req, res) => {
    // simulate expensive work
    await new Promise((r) => setTimeout(r, 2000));

    res.json({
      success: true,
      message: "AI generation completed",
    });
  }
);

app.listen(3000, () => {
  console.log("running");
});