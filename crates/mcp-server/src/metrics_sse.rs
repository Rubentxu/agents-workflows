//! Metrics SSE Streaming Module
//!
//! Provides SSE endpoint for streaming workflow execution metrics.
//! IDEs agenticos subscribe to execution progress in real-time.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    response::sse::{Event, KeepAlive, Sse},
    Router,
};
use futures_util::Stream;
use tokio::sync::broadcast;
use metrics::domain::MetricEvent;

/// Query parameters for metrics subscription
#[derive(Debug, serde::Deserialize)]
pub struct MetricsQuery {
    /// Execution ARN to subscribe to. Use "*" for all executions.
    pub execution: Option<String>,
}

/// Broadcast channel for metrics events
#[derive(Clone)]
pub struct MetricsBroadcaster {
    sender: broadcast::Sender<MetricEvent>,
}

impl MetricsBroadcaster {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(1000);
        Self { sender }
    }

    /// Subscribe to metrics stream
    pub fn subscribe(&self) -> broadcast::Receiver<MetricEvent> {
        self.sender.subscribe()
    }

    /// Broadcast a metric event to all subscribers
    pub fn broadcast(&self, event: MetricEvent) {
        let _ = self.sender.send(event);
    }
}

impl Default for MetricsBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}

/// SSE handler for metrics streaming
pub async fn metrics_sse_handler(
    Query(params): Query<MetricsQuery>,
    broadcaster: State<Arc<MetricsBroadcaster>>,
) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let execution_arn = params.execution.clone();
    let receiver = broadcaster.subscribe();

    // Create a stream that combines metrics events with keep-alive
    let stream = futures_util::stream::unfold(
        (receiver, execution_arn, 0u64),
        |(mut receiver, execution_arn, tick)| async move {
            // Check for metrics events first
            match receiver.recv().await {
                Ok(event) => {
                    // Filter by execution ARN if specified
                    if let Some(ref filter_arn) = execution_arn {
                        if filter_arn != "*" && event.execution_arn != *filter_arn {
                            return Some((Ok(Event::default()
                                .event("skip")
                                .data("{}")), (receiver, execution_arn, tick)));
                        }
                    }

                    let event_type = serde_json::to_string(&event.event_type).unwrap_or_default();
                    let event_data = serde_json::to_string(&event).unwrap_or_default();

                    Some((
                        Ok(Event::default()
                            .event(event_type)
                            .data(event_data)),
                        (receiver, execution_arn, tick),
                    ))
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    Some((
                        Ok(Event::default()
                            .event("skip")
                            .data("{}")),
                        (receiver, execution_arn, tick),
                    ))
                }
                Err(broadcast::error::RecvError::Closed) => {
                    // Stream ended
                    return None;
                }
            }
        },
    );

    Sse::new(stream)
        .keep_alive(KeepAlive::default())
}

/// Create metrics routes
pub fn metrics_routes(broadcaster: Arc<MetricsBroadcaster>) -> Router {
    Router::new()
        .route("/metrics/sse", axum::routing::get(metrics_sse_handler))
        .with_state(broadcaster)
}

#[cfg(test)]
mod tests {
    use super::*;
    use metrics::domain::MetricEventType;

    #[tokio::test]
    async fn test_metrics_broadcaster_sse_subscription() {
        let broadcaster = MetricsBroadcaster::new();
        let execution_arn = "arn:local:workspace/test:execution/1";

        let mut receiver = broadcaster.subscribe();

        let event = MetricEvent::new(
            execution_arn.to_string(),
            "stage-1".to_string(),
            MetricEventType::Started,
        );
        broadcaster.broadcast(event.clone());

        let received = tokio::time::timeout(
            std::time::Duration::from_millis(100),
            receiver.recv()
        ).await.expect("should receive event").expect("should not error");

        assert_eq!(received.execution_arn, execution_arn);
        assert_eq!(received.stage_id, "stage-1");
        assert!(matches!(received.event_type, MetricEventType::Started));
    }

    #[tokio::test]
    async fn test_metrics_broadcaster_filters_by_execution() {
        let broadcaster = MetricsBroadcaster::new();

        let mut receiver = broadcaster.subscribe();

        // Broadcast event for different execution - receiver gets it (filtering at SSE handler layer)
        let event = MetricEvent::new(
            "arn:local:workspace/other:execution/1".to_string(),
            "stage-1".to_string(),
            MetricEventType::Completed,
        );
        broadcaster.broadcast(event);

        // Receive the event - it arrives at receiver since filtering happens at SSE handler level
        let received = tokio::time::timeout(
            std::time::Duration::from_millis(100),
            receiver.recv()
        ).await.expect("should receive").expect("should not error");

        // The receiver gets all events; SSE handler does the filtering
        assert_eq!(received.execution_arn, "arn:local:workspace/other:execution/1");

        // Now test that we can receive a matching event
        let event2 = MetricEvent::new(
            "arn:local:workspace/test:execution/1".to_string(),
            "stage-1".to_string(),
            MetricEventType::Started,
        );
        broadcaster.broadcast(event2);

        let received = tokio::time::timeout(
            std::time::Duration::from_millis(100),
            receiver.recv()
        ).await.expect("should receive").expect("should not error");

        assert_eq!(received.execution_arn, "arn:local:workspace/test:execution/1");
    }
}
