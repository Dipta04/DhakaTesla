# Diagrams

The SVG files in this folder are ready to insert into a video, slide, README, or draw.io. The Mermaid source below is editable in [Mermaid Live](https://mermaid.live/); diagrams.net also imports Mermaid via **Arrange → Insert → Advanced → Mermaid**.

## Architecture

```mermaid
flowchart LR
  B[Browser] -->|same-origin HTTPS| N[Next.js App Router]
  N -->|/api rewrite| E[Express REST API]
  E --> A[Auth and validation]
  E --> R[Ride and pool service]
  A --> P[Prisma ORM]
  R -->|vehicle row lock + transaction| P
  P --> D[(PostgreSQL)]
  D -. local Docker or hosted Prisma Postgres .- C[Deployment choice]
```

## Entity relationship diagram

```mermaid
erDiagram
  USER ||--o| VEHICLE : drives
  USER ||--o{ RIDE_REQUEST : requests
  USER ||--o{ RIDE_EVENT : acts
  VEHICLE ||--o{ POOL : serves
  POOL ||--o{ MEMBERSHIP : contains
  RIDE_REQUEST ||--o| MEMBERSHIP : joins
  RIDE_REQUEST ||--o{ RIDE_EVENT : records
  USER {
    uuid id PK
    string name
    string email UK
    string phone UK
    string passwordHash
    Role role
  }
  VEHICLE {
    uuid id PK
    uuid driverId FK,UK
    string name
    int capacity
    bool isOnline
  }
  RIDE_REQUEST {
    uuid id PK
    uuid passengerId FK
    string pickup
    string destination
    int seats
    RequestStatus status
    int baseFarePaisa
    int distanceChargePaisa
    int poolDiscountPaisa
    int farePaisa
    PaymentMethod payment
  }
  POOL {
    uuid id PK
    uuid vehicleId FK
    PoolStatus status
    string pickup
  }
  MEMBERSHIP {
    uuid id PK
    uuid poolId FK
    uuid requestId FK,UK
    int seats
  }
  RIDE_EVENT {
    uuid id PK
    uuid requestId FK
    uuid actorId FK
    RequestStatus from
    RequestStatus to
    string note
    datetime createdAt
  }
```
