# Plan_A Mobile App

React Native (Expo) mobile application for trip planning.

## Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI
- iOS Simulator (Mac) or Android Emulator
- **Backend running in Docker** (see main README.md)

## Setup

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Configure API URL

**Important**: The mobile app needs to connect to your backend running in Docker.

#### Get Your Local IP Address

```bash
node scripts/get-local-ip.js
```

This will show your local IP (e.g., `10.0.0.175`).

#### Update API Configuration

Edit `src/services/api.ts` and update the IP address:

```typescript
const API_BASE_URL = __DEV__ 
  ? 'http://YOUR_IP_HERE:8000/v1'  // Replace with your IP
  : 'https://api.plana.app/v1';
```

**Why not localhost?**
- iOS Simulator and Android Emulator interpret `localhost` as the device itself
- Docker runs on your host machine, so you need the host's IP address

### 3. Start Development Server

```bash
npm start
```

This will open Expo DevTools. Choose your platform:
- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Scan QR code with Expo Go app for physical device

## Testing

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

### Test Structure

```
src/
├── services/
│   └── __tests__/
│       └── api.test.ts          # API service tests
└── features/
    └── Auth/
        └── __tests__/
            └── RegisterScreen.test.tsx  # UI tests
```

## Development

### Available Scripts

- `npm start` - Start Expo development server
- `npm run ios` - Open in iOS Simulator
- `npm run android` - Open in Android Emulator
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report

### Project Structure

```
mobile/
├── src/
│   ├── features/           # Feature modules
│   │   ├── Auth/          # Authentication screens
│   │   ├── ItineraryBuilder/
│   │   └── MapView/
│   ├── navigation/        # Navigation configuration
│   ├── services/          # API and external services
│   └── utils/             # Utility functions
├── assets/                # Images, fonts, etc.
├── scripts/               # Build and utility scripts
└── __tests__/             # Test files
```

## Troubleshooting

### "Network Error" or "ECONNREFUSED"

**Problem**: App can't connect to backend.

**Solutions**:
1. Verify backend is running:
   ```bash
   docker ps | grep plana_backend
   ```

2. Check your IP address hasn't changed:
   ```bash
   node scripts/get-local-ip.js
   ```

3. Update `src/services/api.ts` with correct IP

4. Restart Expo:
   ```bash
   npm start -- --clear
   ```

### Backend Returns 500 Error

Check backend logs:
```bash
docker logs plana_backend --tail 50
```

### Tests Failing

1. Make sure dependencies are installed:
   ```bash
   npm install
   ```

2. Clear test cache:
   ```bash
   npm test -- --clearCache
   ```

3. Check test output for specific failures

### IP Address Changes

Your IP may change when:
- Switching WiFi networks
- Connecting/disconnecting VPN
- Restarting your router

**Solution**: Run `node scripts/get-local-ip.js` and update `api.ts`

## Production Build

### iOS

```bash
eas build --platform ios
```

### Android

```bash
eas build --platform android
```

## Environment Variables

Create `.env` file:

```env
# Development
EXPO_PUBLIC_API_URL=http://10.0.0.175:8000/v1

# Production
EXPO_PUBLIC_API_URL=https://api.plana.app/v1
```

Then update `api.ts`:

```typescript
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 
  (__DEV__ ? 'http://10.0.0.175:8000/v1' : 'https://api.plana.app/v1');
```

## Contributing

1. Write tests first (TDD approach)
2. Make tests pass
3. Refactor code
4. Run full test suite
5. Update documentation

## Common Issues

### "Invariant Violation: Module AppRegistry is not a registered callable module"

**Solution**: Clear cache and restart:
```bash
npm start -- --clear
```

### "Unable to resolve module"

**Solution**: Reinstall dependencies:
```bash
rm -rf node_modules
npm install
```

### Simulator Not Opening

**iOS**:
```bash
sudo xcode-select --switch /Applications/Xcode.app
```

**Android**:
- Open Android Studio
- Tools → AVD Manager
- Start an emulator

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [React Navigation](https://reactnavigation.org/)
- [Testing Library](https://testing-library.com/docs/react-native-testing-library/intro/)

## Support

For issues, check:
1. This README
2. `TEST_PLAN.md` for testing help
3. Main project README
4. Backend logs: `docker logs plana_backend`
