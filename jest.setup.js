import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

import '@testing-library/jest-dom'

import mockAxios from 'jest-mock-axios';
afterEach(() => {
    // cleaning up the mess left behind the previous test
    mockAxios.reset();
});