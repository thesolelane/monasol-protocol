# MonaSol Notification Service Architecture

## Overview

The Notification Service is an off-chain relay that delivers security alerts and protocol events to users via multiple channels. It is a **read-only relay** — it cannot act on-chain, sign transactions, or override security controls.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NOTIFICATION SERVICE                                 │
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │   Event     │    │   Queue     │    │  Processor  │    │   Sender    │   │
│  │   Listener  │───►│  (Redis)    │───►│   Workers   │───►│   Router    │   │
│  │             │    │             │    │             │    │             │   │
│  │ • Subgraph  │    │ • Priority  │    │ • Template  │    │ • Email     │   │
│  │   webhooks  │    │   queues    │    │   engine    │    │ • SMS       │   │
│  │ • On-chain  │    │ • Delayed   │    │ • User      │    │ • Push      │   │
│  │   events    │    │   delivery  │    │   prefs     │    │ • Discord   │   │
│  │ • Direct    │    │ • Retry     │    │ • Rate      │    │ • TG        │   │
│  │   RPC poll  │    │   logic     │    │   limiting  │    │             │   │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘   │
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│  │   User      │    │   Template  │    │   Metrics   │                    │
│  │   Registry  │    │   Store     │    │   & Logs    │                    │
│  │             │    │             │    │             │                    │
│  │ • Email     │    │ • Email     │    │ • Delivery  │                    │
│  │ • Phone     │    │   HTML      │    │   rates     │                    │
│  │ • Discord   │    │ • SMS text  │    │ • Latency   │                    │
│  │   ID        │    │ • Push      │    │ • Errors    │                    │
│  │ • TG chat   │    │   payload   │    │ • Opt-outs  │                    │
│  │ • Push      │    │ • Discord   │    │             │                    │
│  │   tokens    │    │   embed     │    │             │                    │
│  └─────────────┘    └─────────────┘    └─────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Event Sources

### 1. Subgraph Webhooks
```javascript
// The Graph webhook endpoint
POST /webhook/subgraph
{
  "event": "SecurityAlert",
  "data": {
    "alert_id": "0xabc...",
    "locker": "0x123...",
    "vault_id": 42,
    "reporter": "0xdef...",
    "alert_type": "UNUSUAL_PATTERN",
    "severity": 4,
    "timestamp": 1714656000
  }
}
```

### 2. Direct RPC Polling (Fallback)
```javascript
// Poll Monad RPC every 10 seconds for new events
const filter = {
  address: NEIGHBORHOOD_WATCH_CONTRACT,
  topics: [ethers.id("SecurityAlert(bytes32,address,uint256,address,string,uint8,uint256)")],
  fromBlock: lastCheckedBlock + 1
};
const logs = await provider.getLogs(filter);
```

### 3. Solana WebSocket
```javascript
// Listen for NFT transfers on Solana
const connection = new Connection(SOLANA_RPC);
connection.onAccountChange(NFT_MINT_ADDRESS, (accountInfo) => {
  // Parse NFT transfer, emit notification
});
```

## Queue System (Redis)

### Priority Queues
| Queue | Priority | Max Retries | Delay |
|-------|----------|-------------|-------|
| `critical` | 1 (Highest) | 5 | 0s |
| `high` | 2 | 4 | 5s |
| `medium` | 3 | 3 | 30s |
| `low` | 4 | 2 | 5min |
| `digest` | 5 (Lowest) | 1 | 24h |

### Queue Rules
- Critical: Collective locks, emergency pauses, large outflows
- High: Health warnings, failed nodes, slash events
- Medium: Rotation reminders, proposal updates, badge earnings
- Low: Daily summaries, marketing, non-urgent updates
- Digest: Weekly rollup, inactive user re-engagement

## Notification Templates

### Template 1: Collective Lock Triggered (Critical)
```html
<!-- Email -->
Subject: 🚨 SECURITY ALERT — Locker {{locker_address}} Locked

Your vault (ID: {{vault_id}}) in Locker {{locker_address}} has been 
placed under collective lock due to a confirmed security threat.

Alert Type: {{alert_type}}
Severity: {{severity}}/5
Reported by: {{reporter_address}} (Reputation: {{reputation}})
Time: {{timestamp}}

Your vault is in System mode and has been automatically protected.
You do NOT need to take action. The lock will be reviewed by the 
security team within 1 hour.

View details: https://dashboard.monasol.io/lockers/{{locker_address}}

This is an automated security alert. Do not reply.
```

```json
// SMS
"MonaSol ALERT: Locker {{short_address}} locked due to {{alert_type}}. 
Your vault is protected. Details: {{short_url}}"
```

```json
// Push
{
  "title": "🚨 Locker Locked",
  "body": "Security alert triggered. Your vault is protected.",
  "data": {
    "type": "collective_lock",
    "locker": "{{locker_address}}",
    "vault_id": {{vault_id}}
  }
}
```

```json
// Discord
{
  "embeds": [{
    "title": "🔒 Collective Lock Triggered",
    "color": 15158332,
    "fields": [
      {"name": "Locker", "value": "{{locker_address}}", "inline": true},
      {"name": "Vault", "value": "{{vault_id}}", "inline": true},
      {"name": "Alert", "value": "{{alert_type}}", "inline": true},
      {"name": "Severity", "value": "{{severity}}/5", "inline": true},
      {"name": "Reporter", "value": "{{reporter_address}}", "inline": true}
    ],
    "timestamp": "{{iso_timestamp}}"
  }]
}
```

### Template 2: Vault Self-Lock Confirmation (Medium)
```html
Subject: ✅ Vault Locked — Your Action Confirmed

You have successfully locked your vault (ID: {{vault_id}}) in Locker 
{{locker_address}}.

Lock Time: {{timestamp}}
Mode: Self
Status: Locked

To unlock, visit: https://dashboard.monasol.io/vaults/{{vault_id}}
```

### Template 3: Node Rotation Reminder (Low)
```html
Subject: ⏰ Node Rotation Scheduled — {{node_id}}

Node {{node_id}} (Role: {{role}}) is scheduled for mandatory rotation 
in {{hours_remaining}} hours.

Current Health: {{health_score}}/1000
Last Rotation: {{last_rotation}}
Next Rotation: {{next_rotation}}

No action required. Rotation is automatic.
```

### Template 4: MSL Unlock (Medium)
```html
Subject: 🎉 Your MSL Rewards Are Unlocking

Your vault (ID: {{vault_id}}) has reached its 36-month lock period.

MSL Amount: {{msl_amount}}
Unlock Date: {{unlock_date}}
Current Value: ~${{usd_value}} @ ${{msl_price}}

Claim your unlocked MSL at: https://dashboard.monasol.io/rewards
```

## User Preference System

```typescript
interface NotificationPreferences {
  userAddress: string;        // Solana wallet address
  email?: string;
  phone?: string;
  discordId?: string;
  telegramChatId?: string;
  pushTokens: string[];       // Firebase tokens

  channels: {
    email: boolean;
    sms: boolean;
    push: boolean;
    discord: boolean;
    telegram: boolean;
  };

  filters: {
    minSeverity: number;        // Only send if severity >= this
    lockerWhitelist: string[];  // Only these lockers
    alertTypes: string[];       // Only these alert types
    quietHours: {
      enabled: boolean;
      start: string;           // "22:00"
      end: string;             // "08:00"
      timezone: string;        // "America/New_York"
    };
  };

  digest: {
    enabled: boolean;
    frequency: "daily" | "weekly";
    time: string;              // "09:00"
  };
}
```

## Rate Limiting

| Channel | Rate Limit | Burst | Per |
|---------|-----------|-------|-----|
| Email | 100 | 20 | minute |
| SMS | 10 | 5 | minute |
| Push | 1000 | 100 | minute |
| Discord | 30 | 10 | minute |
| Telegram | 30 | 10 | minute |

**Per-user limits:**
- Max 5 critical notifications per hour
- Max 10 high notifications per hour
- Max 20 medium notifications per hour
- Unlimited low/digest (batched)

## Security Considerations

### 1. No On-Chain Actions
The notification service NEVER:
- Signs transactions
- Submits to RPC
- Modifies contract state
- Holds private keys

### 2. Data Privacy
- Email/phone encrypted at rest (AES-256)
- Discord/TG IDs hashed in logs
- Push tokens rotated monthly
- User data deleted on account closure (30-day retention for compliance)

### 3. Anti-Spam
- Cooldown: Same event type to same user, min 5 minutes
- Deduplication: Same alert_id only sent once per channel
- Batching: Multiple low-priority events batched into single digest
- Opt-out: One-click unsubscribe, honored within 24 hours

### 4. Reliability
- Multi-region deployment (US-East, EU-West, APAC)
- Queue persistence: Redis with AOF + RDB
- Dead letter queue: Failed messages after max retries
- Health endpoint: `/health` for load balancer checks
- Circuit breakers: If SendGrid down, fallback to AWS SES

## Deployment

```yaml
# docker-compose.yml
version: '3.8'
services:
  notification-api:
    image: monasol/notifications:latest
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - SENDGRID_API_KEY=${SENDGRID_KEY}
      - TWILIO_SID=${TWILIO_SID}
      - TWILIO_TOKEN=${TWILIO_TOKEN}
      - FIREBASE_KEY=${FIREBASE_KEY}
      - DISCORD_WEBHOOK_URL=${DISCORD_URL}
    depends_on:
      - redis
      - postgres

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=monasol_notifications
      - POSTGRES_USER=monasol
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data

  worker:
    image: monasol/notifications:latest
    command: npm run worker
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      - postgres

volumes:
  redis-data:
  postgres-data:
```

## Monitoring

### Key Metrics
| Metric | Target | Alert If |
|--------|--------|----------|
| Delivery rate (email) | > 98% | < 95% |
| Delivery rate (SMS) | > 99% | < 97% |
| Delivery rate (push) | > 95% | < 90% |
| Queue depth (critical) | < 10 | > 50 |
| Queue depth (high) | < 100 | > 500 |
| Processing latency | < 5s | > 30s |
| Error rate | < 0.1% | > 1% |

### Dashboard Metrics Endpoint
```
GET /metrics
{
  "queues": {
    "critical": {"depth": 3, "processing": 0, "latency_ms": 1200},
    "high": {"depth": 12, "processing": 2, "latency_ms": 3400},
    "medium": {"depth": 45, "processing": 5, "latency_ms": 8900},
    "low": {"depth": 203, "processing": 8, "latency_ms": 45000}
  },
  "delivery_rates": {
    "email": 0.987,
    "sms": 0.994,
    "push": 0.961,
    "discord": 0.982
  },
  "notifications_24h": 15420,
  "active_users": 8934,
  "opt_out_rate": 0.002
}
```
