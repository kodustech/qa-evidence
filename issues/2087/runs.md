# #2087 — worker exits after SIGTERM once shutdown hooks finish (local docker)

- Env: local `docker-compose.dev.yml` stack (worker + Postgres + Mongo + RabbitMQ), checkout containing the #2251 merge `15bad908c` (`observability.ts`, `observability.service.ts`, `apps/worker/src/main.ts` identical to `origin/main`). 2026-11-14 15:39–15:44 UTC.
- Target: the node child `dist/apps/worker/main.js` inside `kodus_worker` (the `nest build --watch` parent stays up). Polled `ps -p <pid>` every second after the signal.

| Run | Signal | Process | `SIGTERM/SIGINT received` | `Shutting down observability system` | `Topology is closed` / exporter errors |
|---|---|---|---|---|---|
| Worker, fix | SIGTERM (idle) | gone after 2 s | 1 | 1 | 0 / 0 |
| Worker, fix | SIGINT (idle) | gone after 2 s | 1 (SIGINT) | 1 | 0 / 0 |
| API, fix | SIGTERM | gone after 2 s | 1 | 1 | 0 / 0 |
| Worker, baseline (the two files at `15bad908c^1`) | SIGTERM (idle) | **still alive after 40 s** | 2 | 2 | 8 / `Failed to initialize MongoDB Exporter` 1, `MongoDB reconnect attempt failed` 1 |

## Worker with the fix, SIGTERM (stdout)
```
INFO [2026-11-14 15:39:50.472 +0000]: SYS:[observability] info - ObservabilitySystem - SIGTERM received, shutting down gracefully
INFO [2026-11-14 15:39:50.473 +0000]: SYS:[observability] info - ObservabilitySystem - Shutting down observability system
INFO [2026-11-14 15:39:50.475 +0000]: SYS:[telemetry] info - TelemetrySystem - Telemetry system shutdown complete
INFO [2026-11-14 15:39:50.477 +0000]: SYS:[mongodb-exporter] info - MongoDBExporter - Graceful shutdown initiated
INFO [2026-11-14 15:39:50.491 +0000]: SYS:[mongodb-exporter] info - MongoDBExporter - All buffers flushed successfully during shutdown
INFO [2026-11-14 15:39:50.495 +0000]: SYS:[mongodb-exporter] info - MongoDBExporter - Graceful shutdown completed
INFO [2026-11-14 15:39:50.495 +0000]: SYS:[observability] info - ObservabilitySystem - Exporter shutdown complete: MongoDBExporter
INFO [2026-11-14 15:39:50.533 +0000]: SYS:[observability] info - ObservabilitySystem - Observability system shutdown complete
INFO [2026-11-14 15:39:50.551 +0000]: SYS:[WorkflowJobConsumer] info - WorkflowJobConsumer - Shutdown signal SIGTERM received. Waiting for active jobs...
INFO [2026-11-14 15:39:50.551 +0000]: SYS:[WorkflowJobConsumer] info - WorkflowJobConsumer - All active jobs drained before shutdown timeout
INFO [2026-11-14 15:39:50.566 +0000]: SYS:[WorkflowJobConsumer] info - WorkflowJobConsumer - Shutdown complete.
```

## Baseline, SIGTERM (stdout)
```
INFO [2026-11-14 15:43:20.741 +0000]: SYS:[observability] info - ObservabilitySystem - SIGTERM received, shutting down gracefully
INFO [2026-11-14 15:43:20.744 +0000]: SYS:[observability] info - ObservabilitySystem - Shutting down observability system
INFO [2026-11-14 15:43:20.747 +0000]: SYS:[telemetry] info - TelemetrySystem - Telemetry system shutdown complete
INFO [2026-11-14 15:43:20.748 +0000]: SYS:[mongodb-exporter] info - MongoDBExporter - Graceful shutdown initiated
INFO [2026-11-14 15:43:20.759 +0000]: SYS:[mongodb-exporter] info - MongoDBExporter - All buffers flushed successfully during shutdown
INFO [2026-11-14 15:43:20.761 +0000]: SYS:[mongodb-exporter] info - MongoDBExporter - Graceful shutdown completed
INFO [2026-11-14 15:43:20.761 +0000]: SYS:[observability] info - ObservabilitySystem - Exporter shutdown complete: MongoDBExporter
INFO [2026-11-14 15:43:20.785 +0000]: SYS:[observability] info - ObservabilitySystem - Observability system shutdown complete
INFO [2026-11-14 15:43:20.800 +0000]: SYS:[WorkflowJobConsumer] info - WorkflowJobConsumer - Shutdown signal SIGTERM received. Waiting for active jobs...
INFO [2026-11-14 15:43:20.801 +0000]: SYS:[WorkflowJobConsumer] info - WorkflowJobConsumer - All active jobs drained before shutdown timeout
INFO [2026-11-14 15:43:20.806 +0000]: SYS:[WorkflowJobConsumer] info - WorkflowJobConsumer - Shutdown complete.
INFO [2026-11-14 15:43:20.858 +0000]: SYS:[observability] info - ObservabilitySystem - SIGTERM received, shutting down gracefully
INFO [2026-11-14 15:43:20.858 +0000]: SYS:[observability] info - ObservabilitySystem - Shutting down observability system
INFO [2026-11-14 15:43:20.858 +0000]: SYS:[telemetry] info - TelemetrySystem - Telemetry system shutdown complete
INFO [2026-11-14 15:43:20.858 +0000]: SYS:[mongodb-exporter] info - MongoDBExporter - Graceful shutdown initiated
INFO [2026-11-14 15:43:20.859 +0000]: SYS:[mongodb-exporter] info - MongoDBExporter - All buffers flushed successfully during shutdown
INFO [2026-11-14 15:43:20.860 +0000]: SYS:[mongodb-exporter] info - MongoDBExporter - Graceful shutdown completed
INFO [2026-11-14 15:43:20.862 +0000]: SYS:[observability] info - ObservabilitySystem - Exporter shutdown complete: MongoDBExporter
INFO [2026-11-14 15:43:20.862 +0000]: SYS:[observability] info - ObservabilitySystem - Observability system shutdown complete
ERROR [2026-11-14 15:43:20.863 +0000]: SYS:[mongodb-exporter] error - MongoDBExporter - Failed to initialize MongoDB Exporter
WARN [2026-11-14 15:43:20.863 +0000]: SYS:[mongodb-exporter] warn - MongoDBExporter - MongoDB reconnect attempt failed during flushLogs
```

Not run: SIGTERM while a job is active (drain path). No job source in the local stack; `WorkflowJobConsumer` drain code is not changed by #2251. The baseline files were restored and the containers stopped after the run.
