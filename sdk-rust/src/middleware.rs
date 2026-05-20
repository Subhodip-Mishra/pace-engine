#[cfg(feature = "axum")]
pub mod axum_adapter {
    use std::sync::Arc;

    use axum::{
        body::Body,
        extract::State,
        http::{HeaderMap, Request, StatusCode},
        middleware::Next,
        response::{IntoResponse, Response},
    };

    use crate::{log_decision, Pace};

    fn extract_ip(headers: &HeaderMap) -> Option<String> {
        headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(',').next())
            .map(|value| value.trim().to_string())
    }

    fn extract_identity(headers: &HeaderMap, header_name: Option<&str>) -> Option<String> {
        let header_name = header_name?;
        headers
            .get(header_name)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string())
    }

    pub async fn middleware(
        State(pace): State<Arc<Pace>>,
        req: Request<Body>,
        next: Next,
    ) -> Response {
        let route = req.uri().path().to_string();
        let headers = req.headers().clone();
        let ip = extract_ip(&headers).unwrap_or_else(|| "unknown".to_string());
        let identity = extract_identity(&headers, pace.identity_header());
        let result = pace.check_detailed_with_identity(identity.as_deref(), &ip, &route);
        log_decision(pace.log_mode(), &result.decision);

        if !result.allowed {
            return (StatusCode::TOO_MANY_REQUESTS, axum::Json(serde_json::json!({"message": "Rate limit exceeded"}))).into_response();
        }

        next.run(req).await
    }
}

#[cfg(feature = "actix")]
pub mod actix_adapter {
    use std::{future::Ready, rc::Rc, sync::Arc, task::{Context, Poll}};

    use actix_web::{
        dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
        error::Error,
        http::StatusCode,
        web::Bytes,
        Error as ActixError,
    };
    use futures_util::future::{ready, LocalBoxFuture};

    use crate::{log_decision, Pace};

    fn extract_ip(headers: &actix_web::http::header::HeaderMap) -> Option<String> {
        headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(',').next())
            .map(|value| value.trim().to_string())
    }

    fn extract_identity(
        headers: &actix_web::http::header::HeaderMap,
        header_name: Option<&str>,
    ) -> Option<String> {
        let header_name = header_name?;
        headers
            .get(header_name)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string())
    }

    pub struct PaceActixMiddleware {
        pace: Arc<Pace>,
    }

    impl PaceActixMiddleware {
        pub fn new(pace: Arc<Pace>) -> Self {
            Self { pace }
        }
    }

    pub struct PaceActixMiddlewareService<S> {
        service: Rc<S>,
        pace: Arc<Pace>,
    }

    impl<S, B> Transform<S, ServiceRequest> for PaceActixMiddleware
    where
        S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
        S::Future: 'static,
        B: 'static,
    {
        type Response = ServiceResponse<B>;
        type Error = Error;
        type InitError = ();
        type Transform = PaceActixMiddlewareService<S>;
        type Future = Ready<Result<Self::Transform, Self::InitError>>;

        fn new_transform(&self, service: S) -> Self::Future {
            ready(Ok(PaceActixMiddlewareService {
                service: Rc::new(service),
                pace: self.pace.clone(),
            }))
        }
    }

    impl<S, B> Service<ServiceRequest> for PaceActixMiddlewareService<S>
    where
        S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
        S::Future: 'static,
        B: 'static,
    {
        type Response = ServiceResponse<B>;
        type Error = Error;
        type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

        forward_ready!(service);

        fn call(&self, req: ServiceRequest) -> Self::Future {
            let service = self.service.clone();
            let pace = self.pace.clone();
            Box::pin(async move {
                let route = req.path().to_string();
                let headers = req.headers().clone();
                let ip = extract_ip(&headers).unwrap_or_else(|| "unknown".to_string());
                let identity = extract_identity(&headers, pace.identity_header());
                let result = pace.check_detailed_with_identity(identity.as_deref(), &ip, &route);
                log_decision(pace.log_mode(), &result.decision);

                if !result.allowed {
                    let (request, _payload) = req.into_parts();
                    let response = actix_web::HttpResponse::TooManyRequests()
                        .json(serde_json::json!({"message": "Rate limit exceeded"}));
                    return Ok(ServiceResponse::new(request, response.map_into_right_body()));
                }

                service.call(req).await
            })
        }
    }
}