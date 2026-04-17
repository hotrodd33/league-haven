import { Component } from 'react';

export default class ErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('ErrorBoundary caught:', error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div className="flex items-center justify-center h-64">
                    <div className="text-center space-y-3 max-w-sm">
                        <p className="text-2xl">⚠️</p>
                        <p className="text-red-400 font-semibold text-sm">Something went wrong</p>
                        <p className="text-xs text-gray-400 break-words">{this.state.error.message}</p>
                        <button
                            onClick={() => this.setState({ error: null })}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
