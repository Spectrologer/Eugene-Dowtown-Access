/**
 * Centralized configuration for the Eugene Access application.
 * This file contains all external URLs and settings to make updates easier.
 */
export const config = {
    // Data sources for data-service.js
    CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRMzAQbd3MdmdliQnNSPgFvX2309klOt524-HuUoojAc2c2kLKwG9Ftr75YUhsXzMfJtpFerLGlmQOK/pub?gid=0&single=true&output=csv',
    REFUGE_API_URL: 'https://www.refugerestrooms.org/api/v1/restrooms/by_location.json',
    BLOCKLIST_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4KJi-cNJVKbT7cP8VFcDXPYld_R2-D5r3aNFdIARobTv-CzWqcdVl-LeDNJyhCPu6PWpYTho1O5Bg/pub?gid=1834778940&single=true&output=csv',
    
    // Google Apps Script URL for form submission in main.js
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxpY5gQKheF--KuqtkzbEVt9v4fskaAmOkHhZBr0CEvRI-OJ3PyKTFFdZbcacJMG9X7/exec',
};
