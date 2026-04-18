import { Component } from 'react';
import { Button } from './ui';

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
                        <p className="text-signal-400 font-semibold text-sm">Something went wrong</p>
                        <p className="text-xs text-gray-400 break-words">{this.state.error.message}</p>
                        <Button
                            size="sm"
                            onClick={() => this.setState({ error: null })}
                        >
                            Try again
                        </Button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
