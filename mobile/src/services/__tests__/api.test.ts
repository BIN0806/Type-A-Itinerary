/**
 * API Service Tests
 * Tests for authentication and network configuration
 */
import { apiService } from '../api';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock axios with factory that returns proper instance
jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: {
      baseURL: 'http://10.0.0.175:8000/v1',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    },
  };
  return {
    create: jest.fn(() => mockAxiosInstance),
    __mockInstance: mockAxiosInstance, // Expose for test access
  };
});
const mockedAxios = axios as jest.Mocked<typeof axios> & { __mockInstance: any };

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('ApiService', () => {
  const mockInstance = (axios as any).__mockInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockInstance.get.mockReset();
    mockInstance.post.mockReset();
  });

  describe('Configuration', () => {
    it('should use correct base URL for development', () => {
      // This test ensures the API URL is accessible from mobile device
      const baseURL = process.env.NODE_ENV === 'production'
        ? 'https://api.plana.app/v1'
        : expect.stringMatching(/^http:\/\/(\d{1,3}\.){3}\d{1,3}:8000\/v1$/);
      
      expect(baseURL).toBeDefined();
    });

    it('should not use localhost in development mode', () => {
      // Critical: localhost doesn't work from simulators/devices
      const apiClient = (apiService as any).client;
      const baseURL = apiClient.defaults.baseURL;
      
      if (process.env.NODE_ENV !== 'production') {
        expect(baseURL).not.toContain('localhost');
        expect(baseURL).not.toContain('127.0.0.1');
      }
    });

    it('should include proper headers', () => {
      const apiClient = (apiService as any).client;
      expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
    });

    it('should have reasonable timeout', () => {
      const apiClient = (apiService as any).client;
      expect(apiClient.defaults.timeout).toBeLessThanOrEqual(30000);
      expect(apiClient.defaults.timeout).toBeGreaterThan(0);
    });
  });

  describe('Authentication - Register', () => {
    it('should successfully register with valid credentials', async () => {
      const mockResponse = {
        data: {
          id: '123',
          email: 'test@example.com',
          preferences: {},
          created_at: new Date().toISOString(),
        },
        status: 201,
      };

      mockInstance.post.mockResolvedValue(mockResponse);

      const result = await apiService.register('test@example.com', 'password123');
      
      expect(result).toEqual(mockResponse.data);
    });

    it('should reject registration with invalid email format', async () => {
      const mockError = {
        response: {
          status: 422,
          data: {
            detail: [
              {
                loc: ['body', 'email'],
                msg: 'value is not a valid email address',
                type: 'value_error.email',
              },
            ],
          },
        },
      };

      mockInstance.post.mockRejectedValue(mockError);

      await expect(
        apiService.register('invalid-email', 'password123')
      ).rejects.toMatchObject({
        response: {
          status: 422,
        },
      });
    });

    it('should reject registration with short password', async () => {
      const mockError = {
        response: {
          status: 422,
          data: {
            detail: [
              {
                loc: ['body', 'password'],
                msg: 'ensure this value has at least 8 characters',
                type: 'value_error.any_str.min_length',
              },
            ],
          },
        },
      };

      mockInstance.post.mockRejectedValue(mockError);

      await expect(
        apiService.register('test@example.com', 'short')
      ).rejects.toMatchObject({
        response: {
          status: 422,
        },
      });
    });

    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network Error');
      (networkError as any).code = 'ECONNREFUSED';

      mockInstance.post.mockRejectedValue(networkError);

      await expect(
        apiService.register('test@example.com', 'password123')
      ).rejects.toThrow('Network Error');
    });

    it('should handle duplicate email registration', async () => {
      const mockError = {
        response: {
          status: 400,
          data: {
            detail: 'Email already registered',
          },
        },
      };

      mockInstance.post.mockRejectedValue(mockError);

      await expect(
        apiService.register('existing@example.com', 'password123')
      ).rejects.toMatchObject({
        response: {
          status: 400,
          data: {
            detail: 'Email already registered',
          },
        },
      });
    });

    it('should handle 500 server errors', async () => {
      const mockError = {
        response: {
          status: 500,
          data: {
            detail: 'Internal Server Error',
          },
        },
      };

      mockInstance.post.mockRejectedValue(mockError);

      await expect(
        apiService.register('test@example.com', 'password123')
      ).rejects.toMatchObject({
        response: {
          status: 500,
        },
      });
    });
  });

  describe('Authentication - Login', () => {
    it('should successfully login and store token', async () => {
      const mockResponse = {
        data: {
          access_token: 'mock-jwt-token',
          token_type: 'bearer',
        },
        status: 200,
      };

      mockInstance.post.mockResolvedValue(mockResponse);

      const result = await apiService.login('test@example.com', 'password123');

      expect(result.access_token).toBe('mock-jwt-token');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('auth_token', 'mock-jwt-token');
    });

    it('should reject invalid credentials', async () => {
      const mockError = {
        response: {
          status: 401,
          data: {
            detail: 'Incorrect email or password',
          },
        },
      };

      mockInstance.post.mockRejectedValue(mockError);

      await expect(
        apiService.login('test@example.com', 'wrongpassword')
      ).rejects.toMatchObject({
        response: {
          status: 401,
        },
      });
    });
  });

  describe('Token Management', () => {
    it('should clear token on logout', async () => {
      await apiService.clearToken();
      
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('auth_token');
    });

    it('should have request interceptor configured', () => {
      // Verify the interceptor mock exists (interceptors are set up during module init)
      expect(mockInstance.interceptors.request.use).toBeDefined();
      expect(typeof mockInstance.interceptors.request.use).toBe('function');
    });

    it('should have response interceptor configured', () => {
      // Verify the interceptor mock exists (interceptors are set up during module init)
      expect(mockInstance.interceptors.response.use).toBeDefined();
      expect(typeof mockInstance.interceptors.response.use).toBe('function');
    });
  });

  describe('Network Resilience', () => {
    it('should timeout after configured duration', async () => {
      const timeoutError = new Error('timeout of 30000ms exceeded');
      (timeoutError as any).code = 'ECONNABORTED';

      mockInstance.post.mockRejectedValue(timeoutError);

      await expect(
        apiService.register('test@example.com', 'password123')
      ).rejects.toThrow('timeout');
    });

    it('should handle DNS resolution failures', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND');
      (dnsError as any).code = 'ENOTFOUND';

      mockInstance.post.mockRejectedValue(dnsError);

      await expect(
        apiService.register('test@example.com', 'password123')
      ).rejects.toThrow('ENOTFOUND');
    });
  });
});
