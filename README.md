# APK Upkem - Pharmaceutical Management System

A comprehensive full-stack pharmaceutical management application built with modern web and mobile technologies. APK Upkem provides an integrated platform for managing pharmaceutical operations, inventory, and analytics across web and mobile interfaces.

## 🎯 Use Case

APK Upkem is designed for pharmaceutical businesses and healthcare organizations to:

- **Manage Operations**: Streamline pharmaceutical inventory management, order processing, and distribution
- **Analytics & Reporting**: Track sales metrics, inventory trends, and generate comprehensive business reports
- **Multi-Platform Access**: Access the system through a responsive web application or dedicated mobile app
- **Secure Management**: Handle sensitive pharmaceutical data with secure authentication and authorization
- **Export Capabilities**: Generate and export reports in multiple formats (Excel, PDF)

## 🏗️ Project Structure

### Web Application (`/`)
A Next.js 16 full-stack web application with TypeScript support.

**Key Features:**
- Server-side rendering and static generation with Next.js
- Modern React 19 UI with component-based architecture
- Tailwind CSS styling with custom animations
- Recharts for data visualization and analytics
- SQLite database integration for data persistence
- Secure authentication with bcrypt hashing and JWT tokens
- Excel import/export functionality

**Tech Stack:**
- **Framework**: Next.js 16.2.3
- **Frontend**: React 19.2.4, TypeScript 5
- **Styling**: Tailwind CSS 4, shadcn UI components
- **Database**: SQLite (better-sqlite3)
- **Security**: bcrypt, jose (JWT)
- **Data Processing**: xlsx for Excel operations
- **Charting**: Recharts 3.8.1

### Mobile Application (`/mobile`)
A React Native Expo application for iOS, Android, and web platforms.

**Key Features:**
- Cross-platform support (iOS, Android, Web)
- Native performance with React Native 0.81.5
- Persistent local storage with AsyncStorage
- Push notifications support
- Bottom tab and stack navigation
- Haptic feedback integration
- PDF printing and file sharing capabilities

**Tech Stack:**
- **Framework**: Expo 54, React Native 0.81.5
- **Frontend**: React 19.1.0, TypeScript 5.9.2
- **State Management**: Zustand 5.0.12
- **Navigation**: React Navigation 7.x
- **Features**: Notifications, Local Storage, Haptics, Print Support

## 🚀 Getting Started

### Web Application

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm build

# Start production server
npm start

# Lint code
npm run lint
```

The web application runs on `http://localhost:3000` by default.

### Mobile Application

```bash
cd mobile

# Install dependencies
npm install

# Start Expo development server
npm start

# Run on specific platform
npm run android    # Android emulator/device
npm run ios        # iOS simulator/device
npm run web        # Web browser
```

## 📋 Key Dependencies

### Web Application
- **UI Components**: Base UI React, shadcn, Lucide Icons
- **Database**: better-sqlite3 (SQLite)
- **Authentication**: bcrypt, jose
- **Data Handling**: xlsx, class-variance-authority, clsx
- **Styling**: Tailwind CSS, Tailwind Merge, Custom Animations

### Mobile Application
- **Navigation**: React Navigation (Bottom Tabs, Stack, Native Stack)
- **Storage**: AsyncStorage
- **Notifications**: Expo Notifications
- **Device Features**: Expo Haptics, Expo Device, Expo Print
- **Constants**: Expo Constants

## 🔐 Security

- **Authentication**: JWT-based authentication with jose
- **Password Hashing**: bcrypt for secure password storage
- **Database**: SQLite with proper query parameterization
- **HTTPS Ready**: Designed for secure production deployment

## 📊 Features Overview

- **Inventory Management**: Track pharmaceutical stock levels and movements
- **Sales & Orders**: Process orders and manage sales transactions
- **Analytics Dashboard**: Visual insights into business metrics and trends
- **Report Generation**: Export data to Excel for further analysis
- **Multi-Device Support**: Seamless experience across web and mobile platforms
- **User Management**: Role-based access control

## 💾 Database

SQLite database for:
- User management and authentication
- Inventory tracking
- Transaction records
- Analytics data

## 🛠️ Development

This project uses:
- **Version Control**: Git
- **Package Manager**: npm
- **Type Safety**: TypeScript
- **Linting**: ESLint with Next.js configuration
- **Build Tools**: Next.js build system (web), Expo build system (mobile)

## 📦 Language Composition

- **TypeScript**: 89.4%
- **JavaScript**: 9.1%
- **CSS**: 1.5%

## 🚢 Deployment

### Web Application
- Vercel recommended for Next.js deployment
- Environment configuration via `.env.local`
- Database migrations handled in code

### Mobile Application
- Expo Application Services (EAS) for building and distribution
- Supports direct to app stores (iOS App Store, Google Play)
- Over-the-air updates capability

## 📝 License

This project is private and not open source.

## 👤 Author

**LakshyaBetala**

## 📞 Support

For issues, feature requests, or support, please use the repository's issue tracker.

---

**Last Updated**: 2026-06-06
