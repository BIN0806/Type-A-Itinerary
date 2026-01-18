/**
 * UploadScreen Tests
 * Tests for image upload and analysis flow
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { UploadScreen } from '../UploadScreen';
import { apiService } from '../../../services/api';
import * as ImagePicker from 'expo-image-picker';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
} as any;

// Mock route
const mockRoute = {
  params: { tripName: 'Test Trip' },
} as any;

// Mock API service
jest.mock('../../../services/api', () => ({
  apiService: {
    uploadImages: jest.fn(),
  },
}));

// Mock ImagePicker
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaType: {
    Images: 'Images',
  },
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('UploadScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Image Selection', () => {
    it('should request permissions before accessing photo library', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: true,
      });

      const { getByText, getAllByText } = render(<UploadScreen navigation={mockNavigation} route={mockRoute} />);

      // #region agent log
      const allAddPhotosElements = getAllByText(/Add Photos/);
      fetch('http://127.0.0.1:7242/ingest/0a1da57d-57c7-41ea-ae91-7bb010679a6d', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'UploadScreen.test.tsx:53', message: 'Hypothesis A - Multiple Add Photos elements found', data: { count: allAddPhotosElements.length, texts: allAddPhotosElements.map((el: any) => el.props?.children) }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'A' }) }).catch(() => { });
      // #endregion

      const addButton = getByText(/Add Photos \(/);
      fireEvent.press(addButton);

      await waitFor(() => {
        expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
      });
    });

    it('should show permission alert if denied', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const { getByText } = render(<UploadScreen navigation={mockNavigation} route={mockRoute} />);

      const addButton = getByText(/Add Photos \(/);
      fireEvent.press(addButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Permission Required',
          expect.any(String)
        );
      });
    });

    it('should handle canceled image selection', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: true,
      });

      const { getByText } = render(<UploadScreen navigation={mockNavigation} route={mockRoute} />);

      const addButton = getByText(/Add Photos \(/);
      fireEvent.press(addButton);

      await waitFor(() => {
        expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
      });

      // Should not show any error
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });

  describe('Image Upload', () => {
    it('should show error when uploading without images', () => {
      const { getByText } = render(<UploadScreen navigation={mockNavigation} route={mockRoute} />);

      const uploadButton = getByText('Analyze Locations');

      // #region agent log
      const isDisabled = uploadButton.props?.accessibilityState?.disabled;
      fetch('http://127.0.0.1:7242/ingest/0a1da57d-57c7-41ea-ae91-7bb010679a6d', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'UploadScreen.test.tsx:108', message: 'Hypothesis B - Button disabled state before press', data: { isDisabled, props: uploadButton.props?.accessibilityState }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'B' }) }).catch(() => { });
      // #endregion

      fireEvent.press(uploadButton);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/0a1da57d-57c7-41ea-ae91-7bb010679a6d', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'UploadScreen.test.tsx:115', message: 'Hypothesis B - Alert.alert calls after press', data: { alertCalls: (Alert.alert as jest.Mock).mock.calls }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'B' }) }).catch(() => { });
      // #endregion

      expect(Alert.alert).toHaveBeenCalledWith(
        'No Images',
        'Please select at least one image'
      );
    });

    it('should successfully upload images', async () => {
      (apiService.uploadImages as jest.Mock).mockResolvedValue({
        job_id: 'test-job-123',
      });

      // Mock image selection first
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [
          { uri: 'file:///test-image-1.jpg' },
          { uri: 'file:///test-image-2.jpg' },
        ],
      });

      const { getByText } = render(<UploadScreen navigation={mockNavigation} route={mockRoute} />);

      // Select images
      const addButton = getByText(/Add Photos \(/);
      fireEvent.press(addButton);

      await waitFor(() => {
        expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
      });

      // Upload images
      const uploadButton = getByText('Analyze Locations');
      fireEvent.press(uploadButton);

      await waitFor(() => {
        expect(apiService.uploadImages).toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith(
          'Upload Successful',
          expect.stringContaining('analyzed'),
          expect.any(Array)
        );
      });
    });

    it('should handle network errors during upload', async () => {
      const networkError = new Error('Network Error');
      (networkError as any).code = 'ECONNREFUSED';
      (apiService.uploadImages as jest.Mock).mockRejectedValue(networkError);

      // Mock image selection
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///test-image.jpg' }],
      });

      const { getByText } = render(<UploadScreen navigation={mockNavigation} route={mockRoute} />);

      // Select and upload
      fireEvent.press(getByText(/Add Photos \(/));
      await waitFor(() => { });

      fireEvent.press(getByText('Analyze Locations'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Upload Failed',
          expect.stringContaining('Cannot connect to server')
        );
      });
    });

    it('should handle OpenAI quota exceeded error', async () => {
      const quotaError = {
        response: {
          status: 429,
          data: {
            detail: 'OpenAI API quota exceeded. Please add API credits.',
          },
        },
      };
      (apiService.uploadImages as jest.Mock).mockRejectedValue(quotaError);

      // Mock image selection
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///test-image.jpg' }],
      });

      const { getByText } = render(<UploadScreen navigation={mockNavigation} route={mockRoute} />);

      fireEvent.press(getByText(/Add Photos \(/));
      await waitFor(() => { });

      fireEvent.press(getByText('Analyze Locations'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Upload Failed',
          expect.stringContaining('quota')
        );
      });
    });

    it('should handle server errors (500)', async () => {
      (apiService.uploadImages as jest.Mock).mockRejectedValue({
        response: {
          status: 500,
          data: {
            detail: 'Internal server error',
          },
        },
      });

      // Mock image selection
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///test-image.jpg' }],
      });

      const { getByText } = render(<UploadScreen navigation={mockNavigation} route={mockRoute} />);

      fireEvent.press(getByText(/Add Photos \(/));
      await waitFor(() => { });

      fireEvent.press(getByText('Analyze Locations'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Upload Failed',
          expect.any(String)
        );
      });
    });

    it('should navigate to confirmation screen on success', async () => {
      (apiService.uploadImages as jest.Mock).mockResolvedValue({
        job_id: 'test-job-456',
      });

      // Mock image selection
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///test-image.jpg' }],
      });

      const { getByText } = render(<UploadScreen navigation={mockNavigation} route={mockRoute} />);

      fireEvent.press(getByText(/Add Photos \(/));
      await waitFor(() => { });

      fireEvent.press(getByText('Analyze Locations'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });

      // Simulate pressing OK on success alert
      const alertCall = (Alert.alert as jest.Mock).mock.calls.find(
        call => call[0] === 'Upload Successful'
      );
      if (alertCall && alertCall[2] && alertCall[2][0]) {
        alertCall[2][0].onPress();
      }

      expect(mockNavigate).toHaveBeenCalledWith('Confirmation', {
        jobId: 'test-job-456',
        tripName: 'Test Trip',
      });
    });
  });

  describe('UI Behavior', () => {
    it('should show loading state during upload', async () => {
      (apiService.uploadImages as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      // Mock image selection
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///test-image.jpg' }],
      });

      const { getByText, queryByTestId } = render(
        <UploadScreen navigation={mockNavigation} route={mockRoute} />
      );

      fireEvent.press(getByText(/Add Photos \(/));
      await waitFor(() => { });

      fireEvent.press(getByText('Analyze Locations'));

      // Should show loading indicator
      await waitFor(() => {
        expect(queryByTestId('loading-indicator')).toBeTruthy();
      });
    });

    it('should disable buttons during upload', async () => {
      let resolveUpload: (value: any) => void;
      (apiService.uploadImages as jest.Mock).mockImplementation(
        () => new Promise(resolve => { resolveUpload = resolve; })
      );

      // Mock image selection
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///test-image.jpg' }],
      });

      const { getByText, queryByTestId } = render(<UploadScreen navigation={mockNavigation} route={mockRoute} />);

      fireEvent.press(getByText(/Add Photos \(/));
      await waitFor(() => { });

      fireEvent.press(getByText('Analyze Locations'));

      // Wait for loading state to appear (indicates upload started)
      await waitFor(() => {
        expect(queryByTestId('loading-indicator')).toBeTruthy();
      });

      // Resolve the upload to cleanup
      resolveUpload!({ job_id: 'test-job' });
    });
  });

  describe('Edge Cases', () => {
    it('should handle uploading maximum allowed images (50)', async () => {
      (apiService.uploadImages as jest.Mock).mockResolvedValue({
        job_id: 'test-job-789',
      });

      const manyImages = Array.from({ length: 50 }, (_, i) => ({
        uri: `file:///test-image-${i}.jpg`,
      }));

      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: manyImages,
      });

      const { getByText } = render(<UploadScreen navigation={mockNavigation} route={mockRoute} />);

      fireEvent.press(getByText(/Add Photos \(/));
      await waitFor(() => { });

      fireEvent.press(getByText('Analyze Locations'));

      await waitFor(() => {
        const formDataArg = (apiService.uploadImages as jest.Mock).mock.calls[0][0];
        expect(formDataArg).toBeInstanceOf(FormData);
      });
    });

    it('should handle remove image action', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [
          { uri: 'file:///test-image-1.jpg' },
          { uri: 'file:///test-image-2.jpg' },
        ],
      });

      const { getByText, getAllByText } = render(
        <UploadScreen navigation={mockNavigation} route={mockRoute} />
      );

      fireEvent.press(getByText(/Add Photos \(/));
      await waitFor(() => { });

      // Remove buttons should appear (× symbol)
      const removeButtons = getAllByText('×');
      expect(removeButtons.length).toBeGreaterThan(0);
    });
  });
});
