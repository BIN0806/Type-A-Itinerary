# Mobile App Test Plan

## Test-Driven Development (TDD) Approach

Following Kent Beck's TDD methodology: **Red → Green → Refactor**

---

## Phase 1: RED (Write Failing Tests)

### ✅ Tests Created

1. **API Service Tests** (`src/services/__tests__/api.test.ts`)
   - Configuration validation (URL, headers, timeout)
   - Registration success/failure scenarios
   - Login authentication
   - Token management
   - Network error handling
   - **Total: 15 test cases**

2. **RegisterScreen Tests** (`src/features/Auth/__tests__/RegisterScreen.test.tsx`)
   - Form validation (empty fields, short password, mismatched passwords)
   - Registration flow (loading states, success, failure)
   - UI/UX behavior (disabled states, navigation)
   - Edge cases (whitespace, rapid clicks)
   - **Total: 13 test cases**

**Total Test Coverage: 28 test cases**

---

## Phase 2: GREEN (Fix Issues & Make Tests Pass)

### Current Issue: Network Configuration

**Problem**: Mobile app uses `localhost:8000` which doesn't work from simulator/device.

**Root Cause**: 
- iOS Simulator/Android Emulator interpret `localhost` as the device itself
- Docker container runs on host machine at `10.0.0.175:8000`
- Network requests fail with `ECONNREFUSED` error

**Solution** (Next Step):
1. Collect runtime logs to confirm diagnosis
2. Update API base URL to use host IP: `http://10.0.0.175:8000/v1`
3. Run tests to verify fix
4. Add environment variable for dynamic IP configuration

---

## Running Tests

### Install Dependencies
```bash
cd /Users/billy/TypeA-Itinerary/mobile
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
npm test -- api.test.ts
npm test -- RegisterScreen.test.ts
```

---

## Expected Test Results (Current State)

### 🔴 FAILING Tests

**API Service Tests:**
- ❌ `should not use localhost in development mode` (FAILING - currently uses localhost)
- ❌ Network-dependent tests may fail if backend unreachable

**RegisterScreen Tests:**
- ❌ Integration tests may fail due to network configuration

### ✅ PASSING Tests

**Form Validation:**
- ✅ Empty field validation
- ✅ Short password validation
- ✅ Password mismatch validation
- ✅ UI rendering tests

---

## Debugging Strategy

### 1. Runtime Evidence Collection

**Instrumentation Added:**
- Log registration attempt with email/password length
- Log API base URL being used
- Capture network errors vs. server errors
- Track response status codes

**Log Location:** `/Users/billy/TypeA-Itinerary/.cursor/debug.log`

### 2. Reproduction Steps

1. Start backend: `docker-compose up`
2. Start mobile app: `npm start`
3. Navigate to Register screen
4. Fill form with:
   - Email: test123@example.com
   - Password: password123
   - Confirm: password123
5. Tap "Sign Up"
6. Observe error and check logs

### 3. Log Analysis

Look for these patterns:

**Network Error (Hypothesis A - LIKELY):**
```json
{
  "location": "api.ts:70",
  "message": "Register error",
  "data": {
    "errorCode": "ECONNREFUSED",
    "isNetworkError": true
  }
}
```

**Server Error (Hypothesis B):**
```json
{
  "location": "api.ts:70",
  "message": "Register error",
  "data": {
    "responseStatus": 500,
    "responseData": {"detail": "..."}
  }
}
```

---

## Fix Implementation Plan

### Step 1: Confirm Network Issue (CURRENT)
- ✅ Added debug instrumentation
- ⏳ Waiting for user to run reproduction steps
- ⏳ Analyze logs to confirm hypothesis

### Step 2: Implement Fix
```typescript
// Update api.ts
const API_BASE_URL = __DEV__ 
  ? 'http://10.0.0.175:8000/v1'  // Host machine IP
  : 'https://api.plana.app/v1';
```

### Step 3: Verify Fix
```bash
# Run tests
npm test

# Expected: All network tests pass
# Expected: Registration works in app
```

### Step 4: Refactor (Phase 3)
- Extract IP to environment variable
- Add IP detection script
- Document setup for different networks
- Add health check endpoint test

---

## Phase 3: REFACTOR (Improve Code Quality)

### Planned Improvements

1. **Environment Configuration**
```typescript
// Add .env support
const API_BASE_URL = __DEV__ 
  ? process.env.EXPO_PUBLIC_API_URL || 'http://10.0.0.175:8000/v1'
  : 'https://api.plana.app/v1';
```

2. **IP Auto-Detection**
```bash
# Add to package.json scripts
"get-ip": "node scripts/get-local-ip.js"
```

3. **Health Check**
```typescript
// Add health check before registration
async isBackendReachable(): Promise<boolean> {
  try {
    await this.client.get('/health');
    return true;
  } catch {
    return false;
  }
}
```

4. **Better Error Messages**
```typescript
if (error.code === 'ECONNREFUSED') {
  Alert.alert(
    'Cannot Connect to Server',
    'Please make sure the backend is running. Check that Docker is started.'
  );
}
```

---

## Success Criteria

### Must Pass:
- ✅ All 28 unit tests pass
- ✅ Registration works from simulator
- ✅ Login works from simulator
- ✅ Network errors have clear messages
- ✅ No localhost references in development mode

### Nice to Have:
- 🎯 80%+ test coverage
- 🎯 Automated IP detection
- 🎯 Health check before API calls
- 🎯 Retry logic for transient failures

---

## Next Steps

1. **User Action Required:**
   - Run reproduction steps
   - Check error message shown
   - Click "Proceed" button

2. **Engineer Action:**
   - Analyze debug logs
   - Confirm network vs. server error
   - Implement fix based on evidence
   - Re-run tests
   - Remove instrumentation after confirmation

3. **Validation:**
   - Run `npm test` (all tests pass)
   - Test registration in app (works)
   - Test with different WiFi networks (still works)
   - Commit changes with passing tests

---

**Status:** 🔴 Phase 1 Complete (RED) - Tests written, waiting for evidence  
**Next:** 🟡 Phase 2 (GREEN) - Fix issue based on logs  
**Then:** 🟢 Phase 3 (REFACTOR) - Improve code quality  

---

**Senior Engineer Notes:**
- Following TDD principles ensures we don't fix the wrong problem
- Runtime evidence prevents guesswork and assumptions
- Comprehensive tests catch regressions
- Refactor only after tests pass (green phase)
- Tests serve as living documentation
