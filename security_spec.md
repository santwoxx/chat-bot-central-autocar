# Security Specification: Central Autocar (Single-Tenant)

## 1. Data Invariants
- **Authentication**: All writes to `leads`, `messages`, `flows`, `settings`, and `analytics` require an authenticated operator/admin session (`request.auth != null`).
- **Authorization & RBAC**:
  - Operators and Administrators can read and write `leads` and `messages`.
  - Only Administrators or system queries can modify `settings` (WhatsApp API credentials) and global `flows/config`.
- **Identity Spoofing Block**: Operators cannot modify metadata on other users or register self-assigned roles without system authorization.
- **Timestamp Integrity**: All `createdAt` and `updatedAt` properties must strictly match the server time (`request.time`).
- **Value Poisoning Block**: Message text size must be bounded (`size() <= 4096`), and phone numbers must be safe strings (`id.matches('^[a-zA-Z5-9_\\-+() ]+$')`).

## 2. The "Dirty Dozen" Attack Vectors
1. **Unauthenticated Read on Leads**: Attacker attempts list query on `/leads` without Auth → MUST BE DENIED.
2. **Unauthenticated Flow Modification**: Attacker attempts update on `/flows/config` → MUST BE DENIED.
3. **Identity Spoofing**: Operador `uid1` attempts to modify `/users/uid2` to change their role to `admin` → MUST BE DENIED.
4. **Credential Exfiltration**: Non-authorized user attempts to read `/settings/whatsapp` containing `accessToken` or `openAiKey` → MUST BE DENIED.
5. **Junk ID Poisoning**: Attacker sends massive 5KB string as document ID on `/leads/` → MUST BE DENIED via `isValidId`.
6. **Self-Escalation**: User profile creation tries to assign `role: admin` on self-registration → MUST BE DENIED.
7. **Negative Unread Leak**: Attacker updates `unreadCount` to `-99` → MUST BE DENIED.
8. **Immortality Invariant Bypass**: User attempts to update `createdAt` on an existing lead → MUST BE DENIED.
9. **Fake Inbound Injection**: Client attempting to write `role: "user"` on behalf of a vendor → MUST BE DENIED.
10. **Admin Password / Token Modification**: Operador attempts to update `/settings/whatsapp` credentials → MUST BE DENIED.
11. **Recursive Wallet Exhaustion**: Repeated deep collection list query without filter constraints → MUST BE DENIED.
12. **Zombie State Bypass**: Operator updating conversation state to values outside list → MUST BE DENIED.
