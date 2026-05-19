//! Metric Emitter - SSE streaming implementation

use crate::domain::{MetricEvent, MetricsError, MetricsResult};
use futures_util::Stream;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

/// SSE event emitter for metrics
pub struct SseEmitter {
    subscriptions: Arc<RwLock<HashMap<String, mpsc::Sender<Result<String, MetricsError>>>>>,
}

impl SseEmitter {
    pub fn new() -> Self {
        Self {
            subscriptions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Subscribe to metrics for an execution
    pub fn subscribe(&self, execution_arn: String) -> impl Stream<Item = Result<String, MetricsError>> {
        let (tx, rx) = mpsc::channel(100);
        self.subscriptions.write().insert(execution_arn, tx);
        ReceiverStream::new(rx)
    }

    /// Emit a metric event to all subscribers
    pub fn emit(&self, event: &MetricEvent) -> MetricsResult<()> {
        let execution_arn = &event.execution_arn;

        if let Some(sender) = self.subscriptions.read().get(execution_arn) {
            let sse_event = format!(
                "event: {}\ndata: {}\n\n",
                serde_json::to_string(&event.event_type)
                    .map_err(|e| MetricsError::InvalidFormat(e.to_string()))?,
                serde_json::to_string(event)
                    .map_err(|e| MetricsError::InvalidFormat(e.to_string()))?
            );

            sender
                .try_send(Ok(sse_event))
                .map_err(|_| MetricsError::EmissionFailed("Channel closed".to_string()))?;
        }

        Ok(())
    }

    /// Unsubscribe from metrics
    pub fn unsubscribe(&self, execution_arn: &str) {
        self.subscriptions.write().remove(execution_arn);
    }

    /// Broadcast to all subscribers
    pub fn broadcast(&self, event: &MetricEvent) -> MetricsResult<()> {
        let sse_event = format!(
            "event: {}\ndata: {}\n\n",
            serde_json::to_string(&event.event_type)
                .map_err(|e| MetricsError::InvalidFormat(e.to_string()))?,
            serde_json::to_string(event)
                .map_err(|e| MetricsError::InvalidFormat(e.to_string()))?
        );

        let subscriptions: Vec<_> = self.subscriptions.read()
            .iter()
            .filter(|(arn, _)| *arn == &event.execution_arn || *arn == "*")
            .map(|(_, sender)| sender.clone())
            .collect();

        for sender in subscriptions {
            sender
                .try_send(Ok(sse_event.clone()))
                .map_err(|_| MetricsError::EmissionFailed("Channel closed".to_string()))?;
        }

        Ok(())
    }
}

impl Default for SseEmitter {
    fn default() -> Self {
        Self::new()
    }
}
