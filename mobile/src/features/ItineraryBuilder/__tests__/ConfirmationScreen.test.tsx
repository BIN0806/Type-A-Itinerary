/**
 * ConfirmationScreen Tests
 * TDD tests for bug fixes and new features
 * 
 * Bugs:
 * - #1: Cards overlap Continue button
 * - #2: Timeout appears during card swiping (should only during loading)
 * - #3: Counter shows wrong format (should be swiped/total)
 * 
 * Features:
 * - Summary review screen after swiping
 * - Location edit/lookup with auto-suggestions
 * - Restaurant photo display
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ConfirmationScreen } from '../ConfirmationScreen';
import { apiService } from '../../../services/api';

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
} as any;

// Mock route
const mockRoute = {
  params: {
    jobId: 'test-job-123',
  },
} as any;

// Mock API service
jest.mock('../../../services/api', () => ({
  apiService: {
    getJobStatus: jest.fn(),
    getCandidates: jest.fn(),
    confirmWaypoints: jest.fn(),
    searchPlaces: jest.fn(),
  },
}));

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock timers
jest.useFakeTimers();

// Sample test data
const mockCandidates = [
  {
    name: 'Liberty Bagels',
    description: 'Famous bagel shop',
    confidence: 0.95,
    google_place_id: 'place_1',
    lat: 40.7128,
    lng: -74.006,
    address: '123 Main St, New York, NY',
    rating: 4.5,
    photo_url: 'https://example.com/photo1.jpg',
    alternatives: [
      {
        name: 'Liberty Bagels Brooklyn',
        google_place_id: 'place_1b',
        lat: 40.6892,
        lng: -73.9442,
        address: '456 Brooklyn Ave',
        rating: 4.3,
      },
    ],
  },
  {
    name: 'Jin Mei Dumpling',
    description: 'Dumpling restaurant',
    confidence: 0.90,
    google_place_id: 'place_2',
    lat: 40.7580,
    lng: -73.9855,
    address: '789 Canal St, New York, NY',
    rating: 4.7,
    photo_url: 'https://example.com/photo2.jpg',
    alternatives: [],
  },
  {
    name: '230 Fifth Rooftop',
    description: 'Rooftop bar',
    confidence: 0.88,
    google_place_id: 'place_3',
    lat: 40.7448,
    lng: -73.9867,
    address: '230 Fifth Ave, New York, NY',
    rating: 4.2,
    photo_url: 'https://example.com/photo3.jpg',
    alternatives: [],
  },
  {
    name: 'Levain Bakery',
    description: 'Cookie bakery',
    confidence: 0.92,
    google_place_id: 'place_4',
    lat: 40.7794,
    lng: -73.9806,
    address: '167 W 74th St, New York, NY',
    rating: 4.8,
    photo_url: 'https://example.com/photo4.jpg',
    alternatives: [],
  },
  {
    name: 'Zibetto Espresso Bar',
    description: 'Coffee shop',
    confidence: 0.85,
    google_place_id: 'place_5',
    lat: 40.7614,
    lng: -73.9776,
    address: '1385 6th Ave, New York, NY',
    rating: 4.4,
    photo_url: 'https://example.com/photo5.jpg',
    alternatives: [],
  },
];

describe('ConfirmationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
  });

  // ============================================
  // BUG #1: Card Layout Tests
  // ============================================
  describe('Bug #1: Card Layout', () => {
    beforeEach(() => {
      (apiService.getJobStatus as jest.Mock).mockResolvedValue({ status: 'completed' });
      (apiService.getCandidates as jest.Mock).mockResolvedValue({ candidates: mockCandidates });
    });

    it('should render cards in a bounded container above the button', async () => {
      const { getByTestId, queryByText } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      // Wait for loading to complete
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        // Swiper container should have testID
        expect(getByTestId('swiper-container')).toBeTruthy();
        // Continue button should be visible
        expect(queryByText(/Continue with/)).toBeTruthy();
      });
    });

    it('should show stacked cards behind the front card', async () => {
      const { getByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        const swiper = getByTestId('swiper-container');
        // Swiper should be configured with stackSize
        expect(swiper).toBeTruthy();
      });
    });
  });

  // ============================================
  // BUG #2: Timeout Handling Tests
  // ============================================
  describe('Bug #2: Timeout Handling', () => {
    it('should NOT show timeout alert after analysis completes', async () => {
      // Mock immediate completion
      (apiService.getJobStatus as jest.Mock).mockResolvedValue({ status: 'completed' });
      (apiService.getCandidates as jest.Mock).mockResolvedValue({ candidates: mockCandidates });

      render(<ConfirmationScreen navigation={mockNavigation} route={mockRoute} />);

      // Complete the polling
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Wait for candidates to load
      await waitFor(() => {
        expect(apiService.getCandidates).toHaveBeenCalled();
      });

      // Now advance past the timeout threshold (60 seconds)
      await act(async () => {
        jest.advanceTimersByTime(60000);
      });

      // Should NOT show timeout alert since we already completed
      expect(Alert.alert).not.toHaveBeenCalledWith(
        'Timeout',
        expect.any(String)
      );
    });

    it('should show timeout alert when analysis takes too long during loading', async () => {
      // Mock never completing
      (apiService.getJobStatus as jest.Mock).mockResolvedValue({ status: 'processing' });

      render(<ConfirmationScreen navigation={mockNavigation} route={mockRoute} />);

      // Advance past timeout threshold
      await act(async () => {
        jest.advanceTimersByTime(65000);
      });

      // Should show timeout alert
      expect(Alert.alert).toHaveBeenCalledWith(
        'Timeout',
        'Analysis is taking longer than expected'
      );
      expect(mockGoBack).toHaveBeenCalled();
    });

    it('should clear polling interval on completion', async () => {
      (apiService.getJobStatus as jest.Mock).mockResolvedValue({ status: 'completed' });
      (apiService.getCandidates as jest.Mock).mockResolvedValue({ candidates: mockCandidates });

      render(<ConfirmationScreen navigation={mockNavigation} route={mockRoute} />);

      // Complete polling
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Reset mock
      (apiService.getJobStatus as jest.Mock).mockClear();

      // Advance more time - should not call API again
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });

      // getJobStatus should not be called after completion
      expect(apiService.getJobStatus).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // BUG #3: Counter Logic Tests
  // ============================================
  describe('Bug #3: Counter Logic', () => {
    beforeEach(() => {
      (apiService.getJobStatus as jest.Mock).mockResolvedValue({ status: 'completed' });
      (apiService.getCandidates as jest.Mock).mockResolvedValue({ candidates: mockCandidates });
    });

    it('should show 0/N before any swipes', async () => {
      const { getByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        const counter = getByTestId('swipe-counter');
        expect(counter.props.children).toContain('0/5');
      });
    });

    it('should increment counter after swiping right (confirm)', async () => {
      const { getByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Simulate swipe right on first card
      await act(async () => {
        const swiper = getByTestId('swiper-container');
        // Trigger onSwiped callback
        swiper.props.onSwiped?.(0);
      });

      await waitFor(() => {
        const counter = getByTestId('swipe-counter');
        expect(counter.props.children).toContain('1/5');
      });
    });

    it('should increment counter after swiping left (skip)', async () => {
      const { getByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Simulate swipe left on first card
      await act(async () => {
        const swiper = getByTestId('swiper-container');
        swiper.props.onSwipedLeft?.(0);
        swiper.props.onSwiped?.(0);
      });

      await waitFor(() => {
        const counter = getByTestId('swipe-counter');
        expect(counter.props.children).toContain('1/5');
      });
    });

    it('should show confirmed count separately', async () => {
      const { getByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        const confirmedCounter = getByTestId('confirmed-counter');
        expect(confirmedCounter).toBeTruthy();
      });
    });
  });

  // ============================================
  // FEATURE: Summary Review Screen
  // ============================================
  describe('Summary Review Screen', () => {
    beforeEach(() => {
      (apiService.getJobStatus as jest.Mock).mockResolvedValue({ status: 'completed' });
      (apiService.getCandidates as jest.Mock).mockResolvedValue({ candidates: mockCandidates });
    });

    it('should show summary screen after all cards swiped', async () => {
      const { getByTestId, queryByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Swipe through all cards
      for (let i = 0; i < mockCandidates.length; i++) {
        await act(async () => {
          const swiper = getByTestId('swiper-container');
          swiper.props.onSwipedRight?.(i);
          swiper.props.onSwiped?.(i);
        });
      }

      await waitFor(() => {
        // Summary view should be visible
        expect(queryByTestId('summary-view')).toBeTruthy();
      });
    });

    it('should display all confirmed locations in summary', async () => {
      const { getByTestId, getAllByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Confirm first 3 cards
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          const swiper = getByTestId('swiper-container');
          swiper.props.onSwipedRight?.(i);
          swiper.props.onSwiped?.(i);
        });
      }

      // Skip remaining cards
      for (let i = 3; i < mockCandidates.length; i++) {
        await act(async () => {
          const swiper = getByTestId('swiper-container');
          swiper.props.onSwipedLeft?.(i);
          swiper.props.onSwiped?.(i);
        });
      }

      await waitFor(() => {
        const locationCards = getAllByTestId(/^summary-location-/);
        expect(locationCards.length).toBe(3);
      });
    });

    it('should allow editing a location from summary', async () => {
      const { getByTestId, queryByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Swipe all cards right
      for (let i = 0; i < mockCandidates.length; i++) {
        await act(async () => {
          const swiper = getByTestId('swiper-container');
          swiper.props.onSwipedRight?.(i);
          swiper.props.onSwiped?.(i);
        });
      }

      await waitFor(() => {
        expect(queryByTestId('summary-view')).toBeTruthy();
      });

      // Tap edit on first location
      const editButton = getByTestId('edit-location-0');
      fireEvent.press(editButton);

      await waitFor(() => {
        expect(queryByTestId('location-edit-modal')).toBeTruthy();
      });
    });
  });

  // ============================================
  // FEATURE: Location Edit with Auto-suggestions
  // ============================================
  describe('Location Edit with Auto-suggestions', () => {
    beforeEach(() => {
      (apiService.getJobStatus as jest.Mock).mockResolvedValue({ status: 'completed' });
      (apiService.getCandidates as jest.Mock).mockResolvedValue({ candidates: mockCandidates });
      (apiService.searchPlaces as jest.Mock).mockResolvedValue({
        results: [
          { name: 'Liberty Bagels Manhattan', place_id: 'new_place_1', address: '100 New St' },
          { name: 'Liberty Bagels Queens', place_id: 'new_place_2', address: '200 Queens Blvd' },
        ],
      });
    });

    it('should show auto-suggestions when typing', async () => {
      const { getByTestId, queryByTestId, queryAllByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Swipe all cards and go to summary
      for (let i = 0; i < mockCandidates.length; i++) {
        await act(async () => {
          const swiper = getByTestId('swiper-container');
          swiper.props.onSwipedRight?.(i);
          swiper.props.onSwiped?.(i);
        });
      }

      await waitFor(() => {
        expect(queryByTestId('summary-view')).toBeTruthy();
      });

      // Open edit modal
      const editButton = getByTestId('edit-location-0');
      fireEvent.press(editButton);

      await waitFor(() => {
        expect(queryByTestId('location-edit-modal')).toBeTruthy();
      });

      // Type in search
      const searchInput = getByTestId('location-search-input');
      fireEvent.changeText(searchInput, 'Liberty');

      // Wait for debounce and API call
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        const suggestions = queryAllByTestId(/^suggestion-/);
        expect(suggestions.length).toBeGreaterThan(0);
      });
    });

    it('should update location when suggestion selected', async () => {
      const { getByTestId, queryByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Swipe all and open edit
      for (let i = 0; i < mockCandidates.length; i++) {
        await act(async () => {
          const swiper = getByTestId('swiper-container');
          swiper.props.onSwipedRight?.(i);
          swiper.props.onSwiped?.(i);
        });
      }

      await waitFor(() => expect(queryByTestId('summary-view')).toBeTruthy());

      fireEvent.press(getByTestId('edit-location-0'));
      
      await waitFor(() => expect(queryByTestId('location-edit-modal')).toBeTruthy());

      fireEvent.changeText(getByTestId('location-search-input'), 'Liberty');
      
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      // Select first suggestion
      await waitFor(async () => {
        const suggestion = getByTestId('suggestion-0');
        fireEvent.press(suggestion);
      });

      // Modal should close and location updated
      await waitFor(() => {
        expect(queryByTestId('location-edit-modal')).toBeNull();
      });
    });
  });

  // ============================================
  // FEATURE: Restaurant Photo Display
  // ============================================
  describe('Restaurant Photo Display', () => {
    beforeEach(() => {
      (apiService.getJobStatus as jest.Mock).mockResolvedValue({ status: 'completed' });
      (apiService.getCandidates as jest.Mock).mockResolvedValue({ candidates: mockCandidates });
    });

    it('should display photo on swipe cards', async () => {
      const { getByTestId, queryByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        // Card should have photo
        const cardPhoto = queryByTestId('card-photo-0');
        expect(cardPhoto).toBeTruthy();
      });
    });

    it('should display photo in summary cards', async () => {
      const { getByTestId, queryByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Swipe all cards
      for (let i = 0; i < mockCandidates.length; i++) {
        await act(async () => {
          const swiper = getByTestId('swiper-container');
          swiper.props.onSwipedRight?.(i);
          swiper.props.onSwiped?.(i);
        });
      }

      await waitFor(() => {
        expect(queryByTestId('summary-view')).toBeTruthy();
        const summaryPhoto = queryByTestId('summary-photo-0');
        expect(summaryPhoto).toBeTruthy();
      });
    });
  });

  // ============================================
  // Loading State Tests
  // ============================================
  describe('Loading State', () => {
    it('should show loading indicator while polling', () => {
      (apiService.getJobStatus as jest.Mock).mockResolvedValue({ status: 'processing' });

      const { getByTestId } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('should show progress text during loading', () => {
      (apiService.getJobStatus as jest.Mock).mockResolvedValue({ status: 'processing' });

      const { getByText } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      expect(getByText('Analyzing your photos...')).toBeTruthy();
    });
  });

  // ============================================
  // Navigation Tests
  // ============================================
  describe('Navigation', () => {
    beforeEach(() => {
      (apiService.getJobStatus as jest.Mock).mockResolvedValue({ status: 'completed' });
      (apiService.getCandidates as jest.Mock).mockResolvedValue({ candidates: mockCandidates });
      (apiService.confirmWaypoints as jest.Mock).mockResolvedValue({ id: 'trip-123' });
    });

    it('should navigate to Constraints screen on continue', async () => {
      const { getByTestId, getByText } = render(
        <ConfirmationScreen navigation={mockNavigation} route={mockRoute} />
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Swipe all cards
      for (let i = 0; i < mockCandidates.length; i++) {
        await act(async () => {
          const swiper = getByTestId('swiper-container');
          swiper.props.onSwipedRight?.(i);
          swiper.props.onSwiped?.(i);
        });
      }

      await waitFor(() => {
        const continueButton = getByText(/Continue to/);
        fireEvent.press(continueButton);
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('Constraints', { tripId: 'trip-123' });
      });
    });
  });
});
