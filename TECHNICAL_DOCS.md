# ClipMaster Pro - Technical Documentation

This document provides a comprehensive technical overview of ClipMaster Pro, detailing its business rules, features, and technical implementation. This documentation is designed to help AI agents and developers understand the system for future improvements and code maintenance.

## Table of Contents
1. [Core Concepts](#core-concepts)
2. [Data Structure](#data-structure)
3. [Feature Implementation](#feature-implementation)
4. [State Management](#state-management)
5. [UI Components](#ui-components)
6. [Business Rules](#business-rules)
7. [External Services](#external-services)
8. [Pro Features](#pro-features)

## Core Concepts

### Clips Management
- A clip is a text snippet that has been copied by the user
- Core properties of a clip:
  ```javascript
  {
    text: string,           // The actual text content
    timestamp: number,      // When the clip was created/copied
    id: string             // Unique identifier
  }
  ```
- Two main collections: `recentClips` and `favoriteClips`
- Storage uses Chrome's Storage API with local scope

### Tab System
- Two main tabs: "Recent" and "Favorites"
- Each tab has its own list (`recentList` and `favoritesList`)
- Tab state is tracked via `currentTab` variable
- Lists are updated independently to maintain performance

## Data Structure

### Storage Schema
```javascript
{
  recentClips: Array<Clip>,     // Recent clips, limited by maxClips
  favoriteClips: Array<Clip>,   // Favorited clips, limited by maxFavorites
  maxClips: number,             // Max number of recent clips (default: 50)
  maxFavorites: number,         // Max number of favorites (default: 5)
  isPro: boolean,               // Pro status flag
  settings: {                   // User settings
    theme: string,
    notifications: boolean
  }
}
```

### State Variables
- `currentTab`: Tracks active tab ('recent' or 'favorites')
- `isPro`: Pro status flag
- `isPinned`: Window pin status
- `recentClips`: Array of recent clips
- `favoriteClips`: Array of favorite clips

## Feature Implementation

### Copy Detection
- Background script listens for copy events
- Implementation in `background.js`:
  ```javascript
  chrome.clipboard.onClipboardDataChanged.addListener()
  ```
- New clips are added via `addClip()` function
- Duplicate detection prevents identical clips

### Search System
1. **Basic Search**
   - Case-insensitive text matching
   - Searches within current tab's clips only
   - Updates results in real-time (debounced)
   - Empty state handling for no results

2. **Semantic Search (Pro)**
   - Uses Supabase Edge Functions
   - Embeddings via OpenAI API
   - Results sorted by similarity score
   - Fallback to basic search on error

### Favorites System
- Toggle via star icon
- Maximum limit enforced (5 for free, unlimited for Pro)
- Persisted in Chrome Storage
- Import/Export functionality for backup

### Pin Window Feature
- Creates floating window
- Maintains position across sessions
- Auto-updates when new clips are added
- Window state tracked via `pinnedWindowId`

## State Management

### Data Flow
1. User Action → Event Handler
2. State Update → Storage Update
3. Storage Update → UI Update
4. UI Update → DOM Manipulation

### Storage Operations
- All storage operations are asynchronous
- Chrome Storage API used for persistence
- Local storage for temporary state
- Batch updates for performance

## UI Components

### Clip Item Structure
```html
<div class="clip-item">
  <div class="clip-text">...</div>
  <button class="action-btn favorite-btn">...</button>
</div>
```

### Empty States
- Different messages for search vs. no content
- Semantic search specific messaging
- Suggestions for user actions

### Theme System
- CSS variables for theming
- Dark/light mode support
- Pro-specific styling

## Business Rules

### Clip Management
1. **Recent Clips**
   - Maximum limit based on plan
   - Free: 50 clips
   - Pro: 200 clips
   - FIFO (First In, First Out) when limit reached
   - Duplicates are moved to top instead of added

2. **Favorites**
   - Free: 5 clips maximum
   - Pro: Unlimited
   - Persist across sessions
   - Can be imported/exported

3. **Search**
   - Basic search: Available to all
   - Semantic search: Pro only
   - Search scope: Current tab only
   - Results limit: Same as clip limits

### Pro Features
1. **Activation**
   - Stripe integration for payment
   - License key storage
   - Automatic status check
   - Grace period handling

2. **Feature Unlocks**
   - Unlimited favorites
   - Semantic search
   - Extended recent clips (200)
   - Pin window feature

### Error Handling
1. **Storage Errors**
   - Retry mechanism
   - Fallback to defaults
   - User notification

2. **API Errors**
   - Graceful degradation
   - Fallback to basic search
   - Error state display

## External Services

### Supabase Integration
- Edge Functions for semantic search
- Authentication via API key
- Rate limiting implementation
- Error handling and retries

### Stripe Integration
- Payment processing
- Webhook handling
- License management
- Pro status verification

## Code Organization

### File Structure
```
extension/
├── manifest.json        # Extension configuration
├── popup/
│   ├── popup.html      # Main UI
│   ├── popup.js        # Core functionality
│   └── styles.css      # Styling
├── background/
│   └── background.js   # Background processes
└── supabase/
    └── functions/      # Edge functions
```

### Key Functions
1. **Clip Management**
   - `addClip()`: Add new clip
   - `toggleFavorite()`: Toggle favorite status
   - `moveToTop()`: Reorder clips
   - `saveClips()`: Persist to storage

2. **UI Updates**
   - `updateList()`: Update clip list
   - `createClipElement()`: Create clip DOM
   - `showEmptyState()`: Show empty states
   - `updateSearchState()`: Update search UI

3. **Pro Features**
   - `checkProStatus()`: Verify pro status
   - `performSemanticSearch()`: AI search
   - `setupProFeatures()`: Initialize pro features

## Future Improvements
1. **Code Optimization**
   - Implement virtual scrolling for large lists
   - Optimize storage operations
   - Improve search performance

2. **Feature Ideas**
   - Folder organization
   - Tags system
   - Cloud sync
   - Sharing capabilities

This documentation serves as a comprehensive guide for understanding the technical implementation and business rules of ClipMaster Pro. AI agents can use this information to make informed decisions about code improvements and feature additions while maintaining the existing functionality and user experience.
