This is an agentic framework Proof-of-Concept, that uses an orchestrator agent to generate a directed acyclic graph of data dependencies between agents. It also enables fault tolerant retries using a verification agent and conditions that specify when agents can run.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Philosophical Trade-Offs

### Retry Mechanism

When deciding how to implement the fault tolerance (e.g. retries), the simplest and most straightforward way would have been to implement it at the protocol level.

However, I decided to instead implement it at the agentic level, by creating an agent which could validate outputs of other agents using AI, by checking whether the outputs match the inputs based on their documentation.

There are a few reasons I decided to move this to the agentic level:
- it keeps the protocol simple and abstract, not bloating it with too many features
- it makes the agentic layer more powerful, since this is a complex feature on the genetic level, which required me to adapt the protocol to make such features possible. In particular, I had to add boolean conditions that specify when agents could run.
- It further illustrates the capacity of the orchestrator node, since the orchestrator node is able to correctly implement this retry mechanism, if instructed.
- and it keeps the code base more modular, through a plug-and-play architecture, since the entire retry functionality is now factored out into the validator agent.

### Other Guardrails

I would have liked to create more guardrails, however due to time constraints, I decided to stick only to the retry mechanism.

As part of that, I would have liked to implement recursive calls of orchestrator agents, however, this would have required a major rework of the user interface to recursively embed DAGs inside DAGs. To keep the UI simple and due to time constraint I left this out.

I would have also liked to implement an additional orchestrator agent which does not plan all steps upfront but rather executes only a few steps and then, based on the results generates the next steps. This might be more powerful in complex scenarios where there is a high level of unpredictability, as the orchestrator agent can adapt its approach on the fly based on incoming results.

### Design

Another trade-off I made on the design front, to not overwhelm the user, was to implement multiple tabs for different views (flow, argents, data).

Further I created a simple run all button with a very simple step by step overview over what process is currently running. This way, users do not get overwhelmed with complexity.

Finally, I implemented a simple view of the directed acyclic graph, in which validation nodes and conditions would not be shown. In this view, the validators run automatically anytime their input changes, so that the user does not even need to be aware of their existence, even though they still operate in the background.

### Initial Estimate

I did believe that the six hours would be enough, since I have developed a similar, more simplistic, agent orchestrator in the past in only thirty minutes, with the dashboard taking perhaps another hour.

However, I did not expect that the verification-and-retry guardrail, would take as much time (2.5 hours). This was mostly because I decided to do this on the agentic layer and not the protocol layer (see philosophical trade-offs). Which I think is a good long-term decision, but it required a lot of rework of both the protocol and the UI to make the much higher complexity presentable to the eye.